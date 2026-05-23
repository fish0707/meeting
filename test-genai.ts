import { GoogleGenAI, Part } from '@google/genai';
const p1: Part = { inlineData: { mimeType: 'audio/mp3', data: '123' } };
const p2: Part = { fileData: { fileUri: '123', mimeType: 'audio/mp3' } };
console.log('types OK');
