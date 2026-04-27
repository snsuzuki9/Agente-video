import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listarModelos() {
  const models = await genAI.listModels();

  for (const m of models) {
    console.log(m.name);
  }
}

listarModelos();