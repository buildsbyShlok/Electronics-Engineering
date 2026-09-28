const bpmEl = document.getElementById("bpmValue");
const spo2El = document.getElementById("spo2Value");
const badgeEl = document.getElementById("healthBadge");
const healthText = document.getElementById("healthText");
const timeEl = document.getElementById("timeValue");

const canvas = document.getElementById("chart");
const ctx = canvas.getContext("2d");

canvas.width = 800;
canvas.height = 260;

let bpmHistory = [];

// 🔁 CHANGE THIS TO YOUR ESP32 IP
const ESP_URL = "http://192.168.1.100/data";

async function fetchData() {
  try {
    const res = await fetch(ESP_URL);
    const data = await res.json();

    const bpm = Math.round(data.bpm);
    const spo2 = Math.round(data.spo2);

    bpmEl.textContent = bpm || "--";
    spo2El.textContent = spo2 ? spo2 + " %" : "--";

    const healthy = bpm >= 60 && bpm <= 100 && spo2 >= 95;

    if (healthy) {
      badgeEl.textContent = "HEALTHY";
      badgeEl.style.background = "#e8f7ee";
      badgeEl.style.color = "#2ecc71";
      healthText.textContent = "Normal";
    } else {
      badgeEl.textContent = "NOT HEALTHY";
      badgeEl.style.background = "#fdecea";
      badgeEl.style.color = "#e74c3c";
      healthText.textContent = "Check";
    }

    timeEl.textContent = new Date().toLocaleTimeString();

    bpmHistory.push(bpm);
    if (bpmHistory.length > 40) bpmHistory.shift();

    drawGraph();
  } catch (e) {
    console.error("ESP32 not reachable");
  }
}

function drawGraph() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#1f4cff";

  bpmHistory.forEach((val, i) => {
    const x = (i / 39) * canvas.width;
    const y = canvas.height - (val * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();
}

setInterval(fetchData, 1000);
