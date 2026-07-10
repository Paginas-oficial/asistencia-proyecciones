const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
// Importamos el gestor de archivos de Google
const { GoogleAIFileManager } = require("@google/generative-ai/server");
require('dotenv').config();

// Verificación de la API Key
if (!process.env.GEMINI_API_KEY) {
    console.error("Error: GEMINI_API_KEY no está definida en el archivo .env");
    process.exit(1);
}

// Inicializamos el SDK de texto y el SDK de archivos
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

async function analizarExpediente(rutaPdf) {
    try {
        console.log('1. Iniciando lectura. Verificando archivo local...');
        if (!fs.existsSync(rutaPdf)) {
            throw new Error(`El archivo en la ruta "${rutaPdf}" no existe.`);
        }

        console.log('2. Subiendo el expediente de 80 páginas al motor de la IA (Esto soporta PDFs escaneados)...');
        
        // Subimos el archivo directamente a la API de Gemini
        const uploadResult = await fileManager.uploadFile(rutaPdf, {
            mimeType: "application/pdf",
            displayName: "Carpeta Fiscal - Prueba",
        });
        
        console.log(`   [Éxito] Archivo procesado temporalmente en la nube.`);
        console.log('3. Analizando los hechos y la tipicidad. Esto tomará unos 30-60 segundos...');

        // Cambiamos a la versión Flash para evitar el bloqueo de cuota
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash", 
            generationConfig: { responseMimeType: "application/json" } 
        });

        const systemPrompt = `
Eres un Asistente Fiscal experto en el Nuevo Código Procesal Penal peruano, especializado en delitos de corrupción.
Tu tarea es evaluar el documento adjunto y determinar si procede la Formalización de la Investigación Preparatoria o el Archivo.

Debes responder ÚNICAMENTE con un objeto JSON válido que tenga esta estructura exacta:
{
  "decision": "FORMALIZAR" o "ARCHIVAR",
  "probabilidadExito": "Alta" o "Media" o "Baja",
  "resumenCronologico": "Breve resumen de los hechos",
  "analisisTipicidad": "Evaluación del tipo penal",
  "elementosConviccionEncontrados": ["lista de indicios y fojas"],
  "elementosFaltantes": ["lista de diligencias faltantes"],
  "sustentoJuridico": "Explicación legal detallada"
}

Reglas: Basate solo en el documento proporcionado. Si no hay algo, indica 'No especificado'. Actúa con rigor jurídico.
`;

        // Generamos el contenido enviando el prompt y la referencia del archivo subido
        const result = await model.generateContent([
            systemPrompt,
            {
                fileData: {
                    fileUri: uploadResult.file.uri,
                    mimeType: uploadResult.file.mimeType
                }
            }
        ]);

        const textoJson = result.response.text();
        
        console.log('\n================ ANÁLISIS JURÍDICO GENERADO ================');
        const resultadoEstructurado = JSON.parse(textoJson);
        console.log(JSON.stringify(resultadoEstructurado, null, 2));
        console.log('============================================================\n');

        // Borramos el archivo de los servidores temporales por confidencialidad
        await fileManager.deleteFile(uploadResult.file.name);
        console.log('[Info de Seguridad] El archivo ha sido eliminado de la memoria de la IA.\n');
        console.log('Procesamiento completado con éxito.');

    } catch (error) {
        console.error('\n[ERROR] Ocurrió un fallo en la ejecución:', error.message);
    }
}

// === EJECUCIÓN ===
analizarExpediente('caso_prueba.pdf');