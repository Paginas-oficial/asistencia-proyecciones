const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require("@google/generative-ai/server");
require('dotenv').config();

const app = express();
const puerto = 3000;

// Middlewares obligatorios
app.use(cors());
app.use(express.json());

// PUNTO 3: Configuración de Multer ampliada a 150MB para soportar tomos grandes escaneados
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 150 * 1024 * 1024 } 
});

// Inicialización de los servicios de Google Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

// Asegurar que la carpeta 'uploads' exista localmente
if (!fs.existsSync('uploads')){
    fs.mkdirSync('uploads');
}

// Ruta principal para el análisis del expediente
app.post('/api/analizar-caso', upload.single('documentoPdf'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se recibió ningún documento.' });
    }

    const rutaLocal = req.file.path;
    console.log(`[Servidor] Procesando tomo recibido: ${req.file.originalname} (${(req.file.size / (1024 * 1024)).toFixed(2)} MB)`);

    try {
        // Enviar el archivo pesado a la API de archivos de Gemini
        const uploadResult = await fileManager.uploadFile(rutaLocal, {
            mimeType: req.file.mimetype,
            displayName: req.file.originalname,
        });

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash", 
            generationConfig: { responseMimeType: "application/json" } 
        });

        // PUNTO 2: Prompt estricto para forzar la citación exacta de páginas/fojas en cada punto
        const systemPrompt = `
Eres un Asistente Fiscal experto en el Nuevo Código Procesal Penal peruano, especializado en delitos de corrupción de funcionarios incorporados en el ordenamiento penal. 
Tu tarea es evaluar el documento adjunto y determinar técnicamente si el caso califica para una Disposición de Formalización de la Investigación Preparatoria o para una Disposición de Archivo.

Debes responder ÚNICAMENTE con un objeto JSON válido con la estructura solicitada.

REGLA DE ORO DE OBLIGATORIO CUMPLIMIENTO:
Cada dato fáctico, indicio, declaración, conclusión o punto de la argumentación jurídica que menciones en 'resumenCronologico', 'analisisTipicidad', 'elementosConviccionEncontrados' y 'sustentoJuridico' DEBE incluir obligatoriamente al final de la frase el número exacto de la página del PDF donde se encuentra, utilizando estrictamente el formato '(Pág. X)'. 

Ejemplo: 'La pericia contable arrojó un desbalance patrimonial de S/. 50,000 (Pág. 34)'.
Si un hecho o elemento relevante no cuenta con el número de página visible o deducible en el documento, añade '(Pág. No especificada)'. Queda terminantemente prohibido omitir la citación de la página. Actúa con el máximo rigor jurídico posible.
`;

        console.log('[Servidor] Iniciando análisis profundo con IA (Generando JSON)...');
        const result = await model.generateContent([
            systemPrompt,
            { fileData: { fileUri: uploadResult.file.uri, mimeType: uploadResult.file.mimeType } }
        ]);

        const textoJson = result.response.text();
        const resultadoEstructurado = JSON.parse(textoJson);

        // Limpieza absoluta de archivos por confidencialidad y espacio
        await fileManager.deleteFile(uploadResult.file.name);
        fs.unlinkSync(rutaLocal);
        
        console.log('[Servidor] Análisis completado con éxito. Rastros eliminados.');
        res.json(resultadoEstructurado);

    } catch (error) {
        console.error('[Error en Servidor]:', error);
        if (fs.existsSync(rutaLocal)) fs.unlinkSync(rutaLocal);
        res.status(500).json({ error: 'Hubo un fallo al analizar el volumen del expediente.' });
    }
});

// PUNTO 3: Configurar el servidor para escuchar y extender el timeout a 10 minutos
const servidorConfigurado = app.listen(puerto, () => {
    console.log(`=================================================`);
    console.log(`Servidor Fiscal Optimizado en http://localhost:${puerto}`);
    console.log(`Listo para recibir tomos grandes y procesar fojas.`);
    console.log(`=================================================`);
});

servidorConfigurado.timeout = 10 * 60 * 1000; // 10 minutos de tiempo de espera máximo