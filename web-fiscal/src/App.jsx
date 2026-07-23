import React, { useState } from 'react';

export default function FiscalDashboard() {
  // 🧠 ESTADOS INDEPENDIENTES PARA CADA "CEREBRO"

  // 1. Estados para Resumen y Análisis Jurídico
  const [fileResumen, setFileResumen] = useState(null);
  const [loadingResumen, setLoadingResumen] = useState(false);
  const [resultadoResumen, setResultadoResumen] = useState(null);

  // 2. Estados para Elementos de Convicción
  const [fileInventario, setFileInventario] = useState(null);
  const [loadingInventario, setLoadingInventario] = useState(false);
  const [resultadoInventario, setResultadoInventario] = useState(null);

  // 3. Estados para Diligencias Faltantes (¡NUEVO!)
  const [fileDiligencias, setFileDiligencias] = useState(null);
  const [loadingDiligencias, setLoadingDiligencias] = useState(false);
  const [resultadoDiligencias, setResultadoDiligencias] = useState(null);

  // --- FUNCIONES DE LLAMADA AL BACKEND (Simuladas por ahora) ---

  const procesarResumen = async () => {
    if (!fileResumen) return alert("Sube un PDF para el resumen");
    setLoadingResumen(true);
    // Aquí irá tu fetch a: POST /api/resumen
    setLoadingResumen(false);
  };

  const procesarInventario = async () => {
    if (!fileInventario) return alert("Sube un PDF para extraer pruebas");
    setLoadingInventario(true);
    // Aquí irá tu fetch a: POST /api/inventario
    setLoadingInventario(false);
  };

  const procesarDiligencias = async () => {
    if (!fileDiligencias) return alert("Sube un PDF para analizar vacíos");
    setLoadingDiligencias(true);
    // Aquí irá tu fetch a: POST /api/diligencias
    setLoadingDiligencias(false);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-8 text-center">Asistencia de Proyecciones Fiscales</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* TARJETA 1: RESUMEN Y ANÁLISIS */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-blue-500">
          <h2 className="text-xl font-semibold mb-2 text-blue-400">🧠 Resumen y Análisis Jurídico</h2>
          <p className="text-sm text-gray-400 mb-4">Analiza hechos, cronología y sustento legal del tomo.</p>
          
          <input 
            type="file" 
            accept="application/pdf"
            onChange={(e) => setFileResumen(e.target.files[0])}
            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 mb-4"
          />
          <button 
            onClick={procesarResumen}
            disabled={loadingResumen}
            className="w-full bg-blue-600 hover:bg-blue-700 p-2 rounded font-bold"
          >
            {loadingResumen ? "Analizando..." : "Generar Resumen"}
          </button>
          
          {/* Zona de resultados Tarjeta 1 */}
          {resultadoResumen && (
            <div className="mt-4 p-4 bg-gray-700 rounded text-sm">
              {/* Aquí renderizas tus datos */}
            </div>
          )}
        </div>

        {/* TARJETA 2: INVENTARIO PROBATORIO (CERO OMISIONES) */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-green-500">
          <h2 className="text-xl font-semibold mb-2 text-green-400">🕵️‍♂️ Elementos de Convicción</h2>
          <p className="text-sm text-gray-400 mb-4">Extrae documentos relevantes y anexos ignorando el ruido procesal.</p>
          
          <input 
            type="file" 
            accept="application/pdf"
            onChange={(e) => setFileInventario(e.target.files[0])}
            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-green-600 file:text-white hover:file:bg-green-700 mb-4"
          />
          <button 
            onClick={procesarInventario}
            disabled={loadingInventario}
            className="w-full bg-green-600 hover:bg-green-700 p-2 rounded font-bold"
          >
            {loadingInventario ? "Extrayendo..." : "Generar Inventario"}
          </button>

          {/* Zona de resultados Tarjeta 2 */}
          {resultadoInventario && (
            <div className="mt-4 p-4 bg-gray-700 rounded text-sm">
              {/* Aquí renderizas tus elementos */}
            </div>
          )}
        </div>

        {/* TARJETA 3: DILIGENCIAS FALTANTES (NUEVA) */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-red-500">
          <h2 className="text-xl font-semibold mb-2 text-red-400">🎯 Diligencias Faltantes</h2>
          <p className="text-sm text-gray-400 mb-4">Identifica vacíos de investigación y sugiere actos procesales.</p>
          
          <input 
            type="file" 
            accept="application/pdf"
            onChange={(e) => setFileDiligencias(e.target.files[0])}
            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-red-600 file:text-white hover:file:bg-red-700 mb-4"
          />
          <button 
            onClick={procesarDiligencias}
            disabled={loadingDiligencias}
            className="w-full bg-red-600 hover:bg-red-700 p-2 rounded font-bold"
          >
            {loadingDiligencias ? "Evaluando..." : "Analizar Estrategia"}
          </button>

          {/* Zona de resultados Tarjeta 3 */}
          {resultadoDiligencias && (
            <div className="mt-4 p-4 bg-gray-700 rounded text-sm">
              {/* Aquí renderizas las diligencias */}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}