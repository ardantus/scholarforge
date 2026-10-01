import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

export async function performPreFlightCheck(title: string, abstract: string, content: string) {
  const prompt = `
    You are an automated academic manuscript pre-screening agent.
    Analyze the following submission for:
    1. Integrity: Check if the abstract matches the title.
    2. Identity Scrubbing: Identify any names or affiliations that might break double-blind review.
    3. Reference Validity: Identify any potential fake or malformed DOIs.
    4. Quality: Provide a brief summary of potential contributions.

    Title: ${title}
    Abstract: ${abstract}
    Content (excerpt): ${content.substring(0, 2000)}

    Return a JSON object with the following fields:
    {
      "integrity_score": number (0-100),
      "identity_markers_found": boolean,
      "potential_issues": string[],
      "summary": string
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });
    
    const text = response.text || "{}";
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini pre-flight check failed:", error);
    return {
      integrity_score: 0,
      identity_markers_found: false,
      potential_issues: ["Check failed due to system error"],
      summary: "AI check unavailable"
    };
  }
}

export async function anonymizeManuscript(content: string) {
  const prompt = `
    You are an academic manuscript editor. Your task is to perform "double-blind identity scrubbing".
    Identify all author names, affiliations, email addresses, and specific institutional mentions in the following manuscript content.
    Replace them with exactly the string "[BLINDED]".
    Preserve all other text, formatting structure, and academic content.
    
    Content to anonymize:
    ${content.substring(0, 5000)}

    Return ONLY the anonymized text content. Do not include any introductory or concluding remarks.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
    });
    return response.text?.trim() || content;
  } catch (error) {
    console.error("Gemini anonymization failed:", error);
    return content; // Fallback to original content
  }
}
