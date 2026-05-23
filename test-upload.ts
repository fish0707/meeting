import { GoogleGenAI } from "@google/genai";
async function test() {
  const ai = new GoogleGenAI({apiKey: 'dummy'});
  try {
     const upload = await ai.files.upload({ file: new Blob(['test'], {type: 'text/plain'}), mimeType: 'text/plain' });
     console.log(upload);
  } catch (e) {
     console.error(e.message);
  }
}
test();
