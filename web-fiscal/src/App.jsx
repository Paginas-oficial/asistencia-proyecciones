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

  // 3. Estados para Diligencias Faltantes
  const [fileDiligencias, setFileDiligencias] = useState(null);
  const [loadingDiligencias, setLoadingDiligencias] = useState(false);
  const [resultadoDiligencias, setResultadoDiligencias] = useState(null);

  // URL Base de tu backend en Render
  const API_BASE_URL = "https://api-fiscal-backend.onrender.com/api";

  // --- FUNCIONES DE LLAMADA AL BACKEND ---

  const procesarResumen = async () => {
    if (!fileResumen) return alert("Sube un PDF para el resumen");
    setLoadingResumen(true);
    setResultadoResumen(null); // Limpiar resultado anterior
    
    try {
      const formData = new FormData();
      formData.append("pdf", fileResumen);

      const respuesta = await fetch(`${API_BASE_URL}/resumen`, {
        method: "POST",
        body: formData
      });
      
      const data = await respuesta.json();
      setResultadoResumen(data);
    } catch (error) {
      console.error("Error:", error);
      alert("Hubo un error al generar el resumen.");
    } finally {
      setLoadingResumen(false);
    }
  };

  const procesarInventario = async () => {
    if (!fileInventario) return alert("Sube un PDF para extraer pruebas");
    setLoadingInventario(true);
    setResultadoInventario(null);

    try {
      const formData = new FormData();
      formData.append("pdf", fileInventario);
      
      const respuesta = await fetch(`${API_BASE_URL}/inventario`, {
          method: "POST",
          body: formData
      });
      
      const data = await respuesta.json();
      setResultadoInventario(data);
    } catch (error) {
      console.error("Error:", error);
      alert("Hubo un error al generar el inventario.");
    } finally {
      setLoadingInventario(false);
    }
  };

  const procesarDiligencias = async () => {
    if (!fileDiligencias) return alert("Sube un PDF para analizar vacíos");
    setLoadingDiligencias(true);
    setResultadoDiligencias(null);

    try {
      const formData = new FormData();
      formData.append("pdf", fileDiligencias);
      
      const respuesta = await fetch(`${API_BASE_URL}/diligencias`, {
          method: "POST",
          body: formData
      });
      
      const data = await respuesta.json();
      setResultadoDiligencias(data);
    } catch (error) {
      console.error("Error:", error);
      alert("Hubo un error al analizar las diligencias.");
    } finally {
      setLoadingDiligencias(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
      <h1 className="text-3xl font-bold mb-8 text-center">Asistencia de Proyecciones Fiscales</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* TARJETA 1: RESUMEN Y ANÁLISIS */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-blue-500 flex flex-col">
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
            className="w-full bg-blue-600 hover:bg-blue-700 p-2 rounded font-bold disabled:opacity-50"
          >
            {loadingResumen ? "Analizando el expediente..." : "Generar Resumen"}
          </button>
          
          {/* Renderizado de Resultados: Resumen */}
          {resultadoResumen && (
            <div className="mt-4 p-4 bg-gray-700 rounded text-sm overflow-y-auto max-h-80 custom-scrollbar">
              <h3 className="font-bold text-blue-300 mb-1">Resumen Cronológico:</h3>
              <p className="mb-3 text-gray-200 leading-relaxed">{resultadoResumen.resumenCronologico}</p>
              
              <h3 className="font-bold text-blue-300 mb-1">Sustento Jurídico:</h3>
              <p className="mb-3 text-gray-200 leading-relaxed">{resultadoResumen.sustentoJuridico}</p>
              
              <h3 className="font-bold text-blue-300 mb-1">Probabilidad de Éxito:</h3>
              <span className={`px-2 py-1 rounded text-xs font-bold ${
                resultadoResumen.probabilidadExito?.toLowerCase().includes('alta') ? 'bg-green-600' :
                resultadoResumen.probabilidadExito?.toLowerCase().includes('media') ? 'bg-yellow-600' : 'bg-red-600'
              }`}>
                {resultadoResumen.probabilidadExito}
              </span>
            </div>
          )}
        </div>

        {/* TARJETA 2: INVENTARIO PROBATORIO (CERO OMISIONES) */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-green-500 flex flex-col">
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
            className="w-full bg-green-600 hover:bg-green-700 p-2 rounded font-bold disabled:opacity-50"
          >
            {loadingInventario ? "Extrayendo pruebas..." : "Generar Inventario"}
          </button>

          {/* Renderizado de Resultados: Inventario */}
          {resultadoInventario && resultadoInventario.elementosConviccionEncontrados && (
            <div className="mt-4 p-4 bg-gray-700 rounded text-sm overflow-y-auto max-h-80 custom-scrollbar">
              <p className="mb-3 text-green-300 font-bold">Total encontrados: {resultadoInventario.elementosConviccionEncontrados.length}</p>
              {resultadoInventario.elementosConviccionEncontrados.map((item, index) => (
                <div key={index} className="mb-3 border-b border-gray-600 pb-2 last:border-0">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-green-300">{item.tipo}</span>
                    <span className="text-xs bg-gray-600 px-2 py-1 rounded text-gray-300 whitespace-nowrap ml-2">
                      Págs. {item.paginaInicio} - {item.paginaFin}
                    </span>
                  </div>
                  <p className="text-gray-200">{item.descripcion}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TARJETA 3: DILIGENCIAS FALTANTES */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-red-500 flex flex-col">
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
            className="w-full bg-red-600 hover:bg-red-700 p-2 rounded font-bold disabled:opacity-50"
          >
            {loadingDiligencias ? "Evaluando vacíos..." : "Analizar Estrategia"}
          </button>

          {/* Renderizado de Resultados: Diligencias */}
          {resultadoDiligencias && resultadoDiligencias.elementosFaltantes && (
            <div className="mt-4 p-4 bg-gray-700 rounded text-sm overflow-y-auto max-h-80 custom-scrollbar">
              <ul className="list-disc pl-5 text-gray-200 space-y-2">
                {resultadoDiligencias.elementosFaltantes.map((diligencia, index) => (
                  <li key={index} className="leading-relaxed text-red-200">
                    <span className="text-gray-200">{diligencia}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}