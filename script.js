let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let recordingPassage = "";

// Backend Java dùng Gemini, nhận POST /api/analyze với multipart field "audio" và "passage".
const AI_API_URL = "/api/analyze";
const PASSAGES = {
  // Thêm bài mới ở đây; nhớ thêm option có cùng value trong index.html.
  yoga: "One activity that helps me stay healthy is doing yoga. I started practicing yoga about a year ago because I wanted to improve my health and relax after a busy day. I usually do it at home by myself. I practice yoga three or four times a week, usually in the evening. I often do it in my bedroom because it’s quiet and comfortable. I usually spend about 20 minutes doing different yoga poses and breathing exercises. Before starting, I prepare a yoga mat and play some music. Then, I do some simple stretches and practice different poses. I also focus on my breathing and try to keep my body relaxed. Although some poses are quite difficult, I always try my best. Doing yoga has taught me to be more patient and disciplined. It also helps me reduce stress, improve my flexibility, and sleep better. Most importantly, I have learned that taking care of my health doesn’t always require difficult activities. Yoga is a simple but useful activity that makes me feel healthier and more relaxed. I hope I can continue practicing it in the future.",
  watch: "One object that is truly special to me is my wristwatch. It was a gift from my parents on my 18th birthday, and it has a simple but elegant design with a brown leather strap. I received it during a small birthday celebration with my family. At first, I thought it was just a beautiful accessory, but over time I realised it meant much more than that. I wear this watch almost every day, especially when I go to school or meet my friends. It helps me keep track of time, and I also love the way it completes my outfit. Even though I have a phone, I still prefer checking the time on my watch because it feels more convenient and stylish. What makes this watch so important is its sentimental value. It reminds me of my parents' love and the effort they put into raising me. Whenever I look at it, I feel more motivated to study harder and be a better version of myself. I know it's not an expensive item, but its meaning is priceless. This watch is more than just a timekeeper; it's a symbol of love, support and good memories.",
  mother: "The person I admire most is my mother. She is in her late forties and works as an accountant. Although she has a busy schedule, she always makes time for our family. To me, she is not only a wonderful mother but also someone I genuinely look up to. Obviously, I have known her my entire life. However, as I have grown older, I have started to understand and appreciate her more. What I admire most about her is her patience and determination. She rarely complains, even when she has to deal with a lot of pressure at work and at home. She is also incredibly thoughtful, always remembering the little things about each family member. I remember one particular time when I was preparing for an important exam. I felt stressed and wanted to give up, but my mother sat down with me, encouraged me and reminded me that mistakes are part of learning. Her support really helped me stay positive. I admire my mother because she has taught me the true meaning of kindness, patience and perseverance. I hope I can be as thoughtful and resilient as she is.",
  festival: "One event that I really enjoyed was my school's annual festival, which took place last October. It was one of the most memorable experiences I have ever had with my classmates, and I still remember it quite clearly. The event was held in the school playground on a Saturday morning. Before the festival, teachers and students had spent several days decorating the school with colourful banners, balloons and handmade posters. There were lots of exciting activities, such as music performances, traditional games, dancing competitions and food stalls. The whole place looked lively and welcoming. I attended the festival with my close friends and classmates. We had actually prepared a short dance performance for our class, so we were both excited and a little nervous. Before going on stage, we practised together and encouraged each other. After our performance, we walked around the school, tried different kinds of food and took lots of photos together. What made this event particularly special was the wonderful atmosphere. Everyone seemed cheerful and full of energy. I also had the chance to spend quality time with my friends outside the classroom, which made our friendship even stronger. Although we were quite tired by the end of the day, we all felt extremely happy. All in all, it was an unforgettable experience because it brought everyone together and gave me many beautiful memories. If my school organises a similar event in the future, I would definitely love to take part in it again."
};

function updatePassage() {
  const passageSelect = document.getElementById("passageSelect");
  document.getElementById("passageText").textContent = PASSAGES[passageSelect.value];
}

const passageSelect = document.getElementById("passageSelect");
const passageKeys = Object.keys(PASSAGES);
const requestedPassage = Number(new URLSearchParams(window.location.search).get("bai")) - 1;
if (Number.isInteger(requestedPassage) && passageKeys[requestedPassage]) {
  passageSelect.value = passageKeys[requestedPassage];
}

passageSelect.addEventListener("change", () => {
  updatePassage();
  const params = new URLSearchParams(window.location.search);
  params.set("bai", String(passageKeys.indexOf(passageSelect.value) + 1));
  window.history.replaceState(null, "", `${window.location.pathname}?${params}${window.location.hash}`);
});
updatePassage();

function showMessage(message) {
  const feedback = document.getElementById("aiFeedback");
  feedback.replaceChildren();
  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  feedback.append(paragraph);
}

function addResultSection(container, title, text) {
  if (!text) return;
  const section = document.createElement("section");
  section.className = "result-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  section.append(heading, paragraph);
  container.append(section);
}

function displayResult(result) {
  const feedback = document.getElementById("aiFeedback");
  const corrected = result.correctedText || result.correction || "";
  const transcript = result.transcript || result.transcription || "";
  const advice = result.feedback || result.tips || "";

  feedback.replaceChildren();
  addResultSection(feedback, "Bạn đã nói", transcript);
  addResultSection(feedback, "Phiên bản gợi ý", corrected);
  addResultSection(feedback, "Nhận xét", advice);

  if (!transcript && !corrected && !advice) {
    showMessage("API chưa trả về nội dung. Hãy kiểm tra response của /api/analyze.");
  }
}

async function convertToWav(blob) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Trình duyệt không hỗ trợ xử lý âm thanh.");

  const audioContext = new AudioContextClass();
  try {
    const decoded = await audioContext.decodeAudioData(await blob.arrayBuffer());
    const targetRate = 16000;
    const outputLength = Math.ceil(decoded.duration * targetRate);
    const mono = new Float32Array(outputLength);
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));

    for (let i = 0; i < outputLength; i++) {
      const start = Math.floor(i * decoded.sampleRate / targetRate);
      const end = Math.min(Math.floor((i + 1) * decoded.sampleRate / targetRate), decoded.length);
      let sample = 0;
      for (const channel of channels) {
        for (let j = start; j < Math.max(start + 1, end); j++) sample += channel[Math.min(j, decoded.length - 1)] / channels.length;
      }
      mono[i] = sample / Math.max(1, end - start);
    }

    const wav = new ArrayBuffer(44 + mono.length * 2);
    const view = new DataView(wav);
    const writeText = (offset, text) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
    writeText(0, "RIFF");
    view.setUint32(4, 36 + mono.length * 2, true);
    writeText(8, "WAVE");
    writeText(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeText(36, "data");
    view.setUint32(40, mono.length * 2, true);
    for (let i = 0; i < mono.length; i++) {
      const sample = Math.max(-1, Math.min(1, mono[i]));
      view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return new Blob([wav], { type: "audio/wav" });
  } finally {
    await audioContext.close();
  }
}

function populateVoices() {
  if (!("speechSynthesis" in window)) return;

  const voiceSelect = document.getElementById("voiceSelect");
  const selectedVoice = voiceSelect.value;
  const englishVoices = window.speechSynthesis.getVoices().filter((voice) =>
    /^en[-_]US$/i.test(voice.lang) || /^en[-_]GB$/i.test(voice.lang)
  );
  voiceSelect.replaceChildren(new Option("Chọn giọng", ""));

  englishVoices.forEach((voice) => {
    const dialect = /^en[-_]US$/i.test(voice.lang) ? "Anh-Mỹ" : "Anh-Anh";
    voiceSelect.add(new Option(`${dialect} — ${voice.name}`, voice.voiceURI));
  });

  if (englishVoices.some((voice) => voice.voiceURI === selectedVoice)) {
    voiceSelect.value = selectedVoice;
  } else {
    const americanVoice = englishVoices.find((voice) => /^en[-_]US$/i.test(voice.lang));
    if (americanVoice) voiceSelect.value = americanVoice.voiceURI;
  }
}

if ("speechSynthesis" in window) {
  populateVoices();
  window.speechSynthesis.addEventListener("voiceschanged", populateVoices);
}

function speakPassage() {
  const status = document.getElementById("status");
  const button = document.getElementById("speakBtn");
  if (!("speechSynthesis" in window)) {
    status.textContent = "Trạng thái: Trình duyệt không hỗ trợ đọc văn bản.";
    return;
  }

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    button.textContent = "🔊 Nghe bài";
    status.textContent = "Trạng thái: Đã dừng đọc bài.";
    return;
  }

  const passageText = document.getElementById("passageText").textContent.trim();
  if (!passageText) return;

  const utterance = new SpeechSynthesisUtterance(passageText);
  const voices = window.speechSynthesis.getVoices();
  const selectedVoiceUri = document.getElementById("voiceSelect").value;
  const selectedVoice = voices.find((voice) => voice.voiceURI === selectedVoiceUri)
    || voices.find((voice) => /^en[-_]US$/i.test(voice.lang))
    || voices.find((voice) => /^en[-_]GB$/i.test(voice.lang));
  if (selectedVoice) utterance.voice = selectedVoice;
  utterance.lang = selectedVoice?.lang || "en-US";
  utterance.rate = 0.95;
  utterance.onstart = () => {
    button.textContent = "⏹ Dừng đọc";
    status.textContent = "Trạng thái: Đang đọc đoạn văn...";
  };
  utterance.onend = () => {
    button.textContent = "🔊 Nghe bài";
    status.textContent = "Trạng thái: Đọc xong đoạn văn.";
  };
  utterance.onerror = () => {
    button.textContent = "🔊 Nghe bài";
    status.textContent = "Trạng thái: Không thể đọc đoạn văn.";
  };
  window.speechSynthesis.speak(utterance);
}

const chatForm = document.getElementById("chatForm");
chatForm.addEventListener("submit", sendChatMessage);

async function sendChatMessage(event) {
  event.preventDefault();
  const input = document.getElementById("chatInput");
  const sendButton = document.getElementById("chatSendBtn");
  const messages = document.getElementById("chatMessages");
  const status = document.getElementById("chatStatus");
  const message = input.value.trim();
  if (!message) return;

  appendChatMessage(message, "user-message");
  input.value = "";
  input.disabled = true;
  sendButton.disabled = true;
  status.textContent = "AI đang trả lời...";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    appendChatMessage(result.reply || "AI chưa gửi nội dung trả lời.", "assistant-message");
    status.textContent = "";
  } catch (error) {
    appendChatMessage(`Xin lỗi, chưa thể kết nối AI: ${error.message}`, "assistant-message");
    status.textContent = "Kiểm tra backend và cấu hình GEMINI_API_KEY.";
  } finally {
    input.disabled = false;
    sendButton.disabled = false;
    input.focus();
    messages.scrollTop = messages.scrollHeight;
  }
}

function appendChatMessage(text, className) {
  const messages = document.getElementById("chatMessages");
  const bubble = document.createElement("div");
  bubble.className = `chat-message ${className}`;
  bubble.textContent = text;
  messages.append(bubble);
  messages.scrollTop = messages.scrollHeight;
}

async function toggleRecording() {
  const recordBtn = document.getElementById("recordBtn");
  const status = document.getElementById("status");

  if (!isRecording) {
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error("Trình duyệt này không hỗ trợ ghi âm.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        document.getElementById("passageSelect").disabled = false;
        const recordedBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
        showMessage("Đang gửi bản ghi đến AI để chép lời và chỉnh sửa...");
        status.textContent = "Trạng thái: Đang xử lý bằng AI...";

        try {
          const audioBlob = await convertToWav(recordedBlob);
          const formData = new FormData();
          formData.append("audio", audioBlob, "recording.wav");
          formData.append("passage", recordingPassage);
          const response = await fetch(AI_API_URL, { method: "POST", body: formData });
          if (!response.ok) {
            const detail = await response.text();
            throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
          }
          displayResult(await response.json());
          status.textContent = "Trạng thái: Đã nhận kết quả.";
        } catch (error) {
          console.error("Lỗi gửi âm thanh:", error);
          showMessage(`Không nhận được phản hồi từ Gemini: ${error.message || "hãy kiểm tra server và cấu hình GEMINI_API_KEY."}`);
          status.textContent = "Trạng thái: Không nhận được phản hồi từ AI.";
        } finally {
          stream.getTracks().forEach((track) => track.stop());
        }
      };

      recordingPassage = PASSAGES[document.getElementById("passageSelect").value];
      document.getElementById("passageSelect").disabled = true;
      mediaRecorder.start();
      isRecording = true;
      recordBtn.innerHTML = '<span class="mic-icon" aria-hidden="true">⏹</span><span>Dừng ghi âm</span>';
      status.textContent = "Trạng thái: Đang ghi âm...";
    } catch (error) {
      console.error("Không thể bắt đầu ghi âm:", error);
      status.textContent = error.message || "Trạng thái: Không thể truy cập microphone.";
    }
  } else {
    mediaRecorder.stop();
    isRecording = false;
    recordBtn.innerHTML = '<span class="mic-icon" aria-hidden="true">🎤</span><span>Bắt đầu ghi âm</span>';
    status.textContent = "Trạng thái: Đã dừng ghi âm.";
  }
}
