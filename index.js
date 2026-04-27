import fs from "fs";
import { spawnSync, execSync } from "child_process";
import axios from "axios";
import "dotenv/config";

// ========================
// CONFIG
// ========================

const pasta = "C:\\Users\\sns9\\agente-motivacional";

// ========================
// TEXTO SEGURO
// ========================

function limparTextoFFmpeg(texto) {
  return texto
    .replace(/'/g, "")
    .replace(/:/g, "")
    .replace(/,/g, "")
    .replace(/!/g, "")
    .replace(/\?/g, "")
    .replace(/%/g, "")
    .replace(/\\/g, "")
    .replace(/\n/g, " ");
}

// ========================
// QUEBRA DE TEXTO
// ========================

function quebrarTexto(texto, limite = 20) {
  const palavras = texto.split(" ");
  let linhas = [];
  let linha = "";

  for (let palavra of palavras) {
    if ((linha + palavra).length > limite) {
      linhas.push(linha.trim());
      linha = palavra + " ";
    } else {
      linha += palavra + " ";
    }
  }

  if (linha) linhas.push(linha.trim());

  return linhas.join("\\N"); // padrão ASS
}

// ========================
// LEGENDA ASS (PRO)
// ========================

function gerarASS(frases) {
  let conteudo = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, BackColour, Bold, Alignment, MarginL, MarginR, MarginV
Style: Default,Arial,60,&H00FFFFFF,&H80000000,1,2,80,80,200

[Events]
Format: Start, End, Style, Text
`;

  let tempo = 0;

  for (let i = 0; i < frases.length; i++) {
    const inicio = formatarTempo(tempo);
    tempo += 3;
    const fim = formatarTempo(tempo);

    let texto = limparTextoFFmpeg(frases[i]);
    texto = quebrarTexto(texto, 18);

    conteudo += `Dialogue: ${inicio},${fim},Default,${texto}\n`;
  }

  fs.writeFileSync(`${pasta}\\legendas.ass`, conteudo);
}

// ========================

function formatarTempo(segundos) {
  const h = String(Math.floor(segundos / 3600)).padStart(1, "0");
  const m = String(Math.floor((segundos % 3600) / 60)).padStart(2, "0");
  const s = String(segundos % 60).padStart(2, "0");
  return `${h}:${m}:${s}.00`;
}

// ========================
// CENAS (SEM TEXTO)
// ========================

function criarCenas(frases) {
  for (let i = 0; i < frases.length; i++) {
    const comando = `ffmpeg -y -loop 1 -i "${pasta}\\imagens\\img${i}.jpg" -i "${pasta}\\audio${i}.wav" -vf "scale=1080:1920,zoompan=z='min(zoom+0.002,1.5)':d=125,format=yuv420p" -shortest -c:v libx264 -c:a aac "${pasta}\\cena${i}.mp4"`;

    execSync(comando, { stdio: "inherit" });

    console.log(`🎬 cena ${i} criada`);
  }
}

// ========================
// JUNTA + LEGENDA FINAL
// ========================

function juntarCenas(qtd) {
  let lista = "";

  for (let i = 0; i < qtd; i++) {
    lista += `file 'cena${i}.mp4'\n`;
  }

  fs.writeFileSync(`${pasta}\\lista.txt`, lista);

  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${pasta}\\lista.txt" -c copy "${pasta}\\temp.mp4"`,
    { stdio: "inherit" }
  );

  // 🔥 aplica legenda ASS
  execSync(
    `ffmpeg -y -i "${pasta}\\temp.mp4" -vf "subtitles=${pasta.replace(
      /\\/g,
      "/"
    )}/legendas.ass" -c:a copy "${pasta}\\video.mp4"`,
    { stdio: "inherit" }
  );

  console.log("🔥 VÍDEO FINAL PRONTO!");
}

// ========================
// LIMPAR ROTEIRO
// ========================

function limparRoteiro(texto) {
  return texto
    .split("\n")
    .map(l => l.trim())
    .filter(
      l =>
        l.length > 0 &&
        !l.toLowerCase().includes("roteiro") &&
        !l.match(/^\d+\./)
    );
}

// ========================
// IA - ROTEIRO
// ========================

async function gerarRoteiro() {
  const prompt = `
Crie 5 frases motivacionais curtas.
SEM explicação.
SEM numeração.
Uma por linha.
`;

  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3",
      prompt,
      stream: false
    })
  });

  const data = await res.json();
  return data.response;
}

// ========================
// IA - TEMAS
// ========================

async function gerarTemasDoRoteiro(roteiro) {
  const prompt = `
Extract 5 cinematic visual prompts.
Return only comma separated.

Text:
${roteiro}
`;

  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3",
      prompt,
      stream: false
    })
  });

  const data = await res.json();
  return data.response.split(",").map(t => t.trim());
}

// ========================
// IMAGENS PEXELS
// ========================

async function baixarImagensPexels(temas) {
  const pastaImg = `${pasta}\\imagens`;

  if (!fs.existsSync(pastaImg)) {
    fs.mkdirSync(pastaImg, { recursive: true });
  }

  for (let i = 0; i < temas.length; i++) {
    try {
      const res = await axios.get("https://api.pexels.com/v1/search", {
        headers: { Authorization: process.env.PEXELS_KEY },
        params: {
          query: temas[i],
          per_page: 1,
          orientation: "portrait"
        }
      });

      const foto = res.data.photos[0];
      if (!foto) continue;

      const img = await axios.get(foto.src.portrait, {
        responseType: "arraybuffer"
      });

      fs.writeFileSync(`${pastaImg}\\img${i}.jpg`, img.data);

      console.log(`🖼️ ${temas[i]} OK`);

      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.log("Erro imagem:", e.message);
    }
  }
}

// ========================
// ÁUDIO (PIPER)
// ========================

function gerarAudiosPorFrase(frases) {
  for (let i = 0; i < frases.length; i++) {
    const caminho = `${pasta}\\audio${i}.wav`;

    const proc = spawnSync(
      "C:\\piper\\piper.exe",
      [
        "--model",
        "C:\\piper\\pt_BR-faber-medium.onnx",
        "--output_file",
        caminho
      ],
      { input: frases[i], encoding: "utf-8" }
    );

    if (proc.status !== 0) {
      console.log("Erro áudio", i);
    } else {
      console.log(`🔊 áudio ${i}`);
    }
  }
}

// ========================
// MAIN
// ========================

async function main() {
  console.log("🚀 INICIANDO AGENTE...");

  const roteiro = await gerarRoteiro();
  const frases = limparRoteiro(roteiro);

  const temas = await gerarTemasDoRoteiro(roteiro);

  await baixarImagensPexels(temas);

  gerarAudiosPorFrase(frases);

  gerarASS(frases);

  criarCenas(frases);

  juntarCenas(frases.length);
}

main();