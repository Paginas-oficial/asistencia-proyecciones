require('dotenv').config();

async function descubrirModelos() {
    console.log("Consultando a Google qué modelos existen realmente para tu API Key...");
    try {
        const respuesta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        const datos = await respuesta.json();
        
        console.log("\n=================================");
        console.log("Copia y pega UNO de estos nombres en tu server.js:");
        console.log("=================================");
        datos.models
            .filter(m => m.supportedGenerationMethods.includes("generateContent"))
            .forEach(m => console.log(`👉 ${m.name.replace('models/', '')}`));
            
    } catch (error) {
        console.error("Error al consultar:", error);
    }
}
descubrirModelos();