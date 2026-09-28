// Fixed Firebase URL
const endpoint = "https://aqi-index-88b4c-default-rtdb.asia-southeast1.firebasedatabase.app/aqi.json";

const subtitle   = document.getElementById("subtitle");
const aqiValue   = document.getElementById("aqiValue");
const aqiStatus  = document.getElementById("aqiStatus");
const rawValue   = document.getElementById("rawValue");
const tempValue  = document.getElementById("tempValue");
const humValue   = document.getElementById("humValue");
const lastUpdate = document.getElementById("lastUpdate");

const canvas = document.getElementById("aqiChart");
const ctx = canvas.getContext("2d");

let history = [];
const maxPoints = 40;

// Fix blurred canvas on high DPI
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// AQI -> color
function aqiColor(aqi) {
  if (aqi <= 50) return "#16a34a";
  if (aqi <= 100) return "#f59e0b";
  if (aqi <= 200) return "#ef4444";
  if (aqi <= 300) return "#b91c1c";
  return "#7f1d1d";
}

function drawChart() {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);
  if (history.length === 0) return;

  ctx.lineWidth = 2;
  ctx.strokeStyle = "#1d4ed8";
  ctx.beginPath();
  history.forEach((p, i) => {
    const x = (i / (maxPoints - 1)) * w;
    const y = h - (p / 500) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

// 1 second refresh
async function poll() {
  try {
    const res = await fetch(endpoint + "?_=" + Date.now());
    const data = await res.json();

    const raw = data.raw ?? 0;
    const aqi = data.aqi ?? 0;
    const status = data.status || "--";
    const temp = data.temp ?? 0;
    const hum = data.hum ?? 0;

    aqiValue.textContent = aqi;
    aqiValue.style.color = aqiColor(aqi);
    aqiStatus.textContent = status;
    aqiStatus.style.color = aqiColor(aqi);
    aqiStatus.style.background = aqiColor(aqi) + "20";

    rawValue.textContent = raw;
    tempValue.textContent = temp + " °C";
    humValue.textContent = hum + " %";

    const now = new Date();
    lastUpdate.textContent = now.toLocaleTimeString();
    subtitle.textContent = "LIVE — Connected";

    history.push(aqi);
    if (history.length > maxPoints) history.shift();
    drawChart();
  } catch {
    subtitle.textContent = "Connection failed — retrying…";
  }
  setTimeout(poll, 1000);
}
poll();
