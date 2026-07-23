import React, { useState } from 'react';

export default function FiscalDashboard() {
  // 🧠 ESTADOS
  const [fileResumen, setFileResumen] = useState(null);
  const [loadingResumen, setLoadingResumen] = useState(false);
  const [resultadoResumen, setResultadoResumen] = useState(null);

  const [fileInventario, setFileInventario] = useState(null);
  const [loadingInventario, setLoadingInventario] = useState(false);
  const [resultadoInventario, setResultadoInventario] = useState(null);

  const [fileDiligencias, setFileDiligencias] = useState(null);
  const [loadingDiligencias, setLoadingDiligencias] = useState(false);
  const [resultadoDiligencias, setResultadoDiligencias] = useState(null);

  const API_BASE_URL = "https://api-fiscal-backend.onrender.com/api";

  // --- LÓGICA DE EXPORTACIÓN A PDF (IGUAL QUE ANTES) ---
  const generarPDF = (titulo, contenidoHTML) => {
    const ventana = window.open('', '_blank');
    ventana.document.write(`
      <html>
        <head>
          <title>${titulo}</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #222; line-height: 1.6; }
            h1 { color: #1e3a8a; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; margin-bottom: 20px; }
            h3 { color: #2563eb; margin-top: 20px; font-size: 18px;}
            p { margin-bottom: 10px; text-align: justify; }
            .item { background: #f3f4f6; padding: 15px; margin-bottom: 15px; border-radius: 8px; border-left: 5px solid #10b981; }
            .item-header { display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 5px; }
            .tipo { color: #047857; font-size: 1.1em; }
            .paginas { background: #d1fae5; color: #065f46; padding: 3px 8px; border-radius: 12px; font-size: 0.85em; }
            .diligencia-item { margin-bottom: 10px; padding: 10px; background: #fef2f2; border-left: 5px solid #ef4444; border-radius: 4px; }
          </style>
        </head>
        <body>
          <h1>${titulo}</h1>
          ${contenidoHTML}
          <script>
            setTimeout(() => { window.print(); window.close(); }, 500);
          </script>
        </body>
      </html>
    `);
    ventana.document.close();
  };

  const exportarResumen = () => {
    const html = `
      <h3>Resumen Cronológico</h3><p>${resultadoResumen.resumenCronologico}</p>
      <h3>Sustento Jurídico</h3><p>${resultadoResumen.sustentoJuridico}</p>
      <h3>Probabilidad de Éxito</h3><p><strong>${resultadoResumen.probabilidadExito}</strong></p>
    `;
    generarPDF("Reporte de Resumen y Análisis Jurídico", html);
  };

  const exportarInventario = () => {
    const itemsHtml = resultadoInventario.elementosConviccionEncontrados.map(item => `
      <div class="item">
        <div class="item-header">
          <span class="tipo">${item.tipo}</span>
          <span class="paginas">Fojas: ${item.paginaInicio} - ${item.paginaFin}</span>
        </div>
        <p style="margin:0; color:#4b5563;">${item.descripcion}</p>
      </div>
    `).join('');
    generarPDF("Inventario de Elementos de Convicción", `<h3>Total extraídos: ${resultadoInventario.elementosConviccionEncontrados.length}</h3>` + itemsHtml);
  };

  const exportarDiligencias = () => {
    const itemsHtml = resultadoDiligencias.elementosFaltantes.map(item => `<div class="diligencia-item">${item}</div>`).join('');
    generarPDF("Estrategia y Diligencias Faltantes", itemsHtml);
  };

  // --- FUNCIONES DE LLAMADA AL BACKEND ---
  const procesarResumen = async () => {
    if (!fileResumen) return alert("Sube un PDF para el resumen");
    setLoadingResumen(true); setResultadoResumen(null);
    try {
      const formData = new FormData(); formData.append("pdf", fileResumen);
      const respuesta = await fetch(`${API_BASE_URL}/resumen`, { method: "POST", body: formData });
      setResultadoResumen(await respuesta.json());
    } catch (error) { alert("Error al generar resumen."); } finally { setLoadingResumen(false); }
  };

  const procesarInventario = async () => {
    if (!fileInventario) return alert("Sube un PDF para extraer pruebas");
    setLoadingInventario(true); setResultadoInventario(null);
    try {
      const formData = new FormData(); formData.append("pdf", fileInventario);
      const respuesta = await fetch(`${API_BASE_URL}/inventario`, { method: "POST", body: formData });
      setResultadoInventario(await respuesta.json());
    } catch (error) { alert("Error al generar inventario."); } finally { setLoadingInventario(false); }
  };

  const procesarDiligencias = async () => {
    if (!fileDiligencias) return alert("Sube un PDF para analizar vacíos");
    setLoadingDiligencias(true); setResultadoDiligencias(null);
    try {
      const formData = new FormData(); formData.append("pdf", fileDiligencias);
      const respuesta = await fetch(`${API_BASE_URL}/diligencias`, { method: "POST", body: formData });
      setResultadoDiligencias(await respuesta.json());
    } catch (error) { alert("Error al analizar estrategia."); } finally { setLoadingDiligencias(false); }
  };

  // --- DISEÑO VISUAL (ESTILOS GARANTIZADOS) ---
  const styles = {
    container: { backgroundColor: '#111827', color: '#f3f4f6', minHeight: '100vh', padding: '2rem', fontFamily: 'system-ui, sans-serif' },
    title: { textAlign: 'center', fontSize: '2.2rem', fontWeight: 'bold', marginBottom: '2rem', color: '#ffffff' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' },
    card: { backgroundColor: '#1f2937', padding: '1.5rem', borderRadius: '12px', border: '1px solid #374151', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)' },
    cardTitle: { fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' },
    cardSubtitle: { fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1.5rem' },
    fileInput: { width: '100%', marginBottom: '1rem', color: '#9ca3af', fontSize: '0.9rem' },
    button: { width: '100%', padding: '0.75rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', border: 'none', color: '#fff', transition: '0.2s', marginBottom: '1rem' },
    btnDownload: { width: '100%', padding: '0.5rem', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', border: '1px solid', backgroundColor: 'transparent', marginTop: '1rem' },
    resultBox: { marginTop: '1rem', padding: '1rem', backgroundColor: '#374151', borderRadius: '8px', fontSize: '0.9rem', overflowY: 'auto', maxHeight: '350px' }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Asistencia de Proyecciones Fiscales</h1>

      <div style={styles.grid}>
        
        {/* TARJETA 1: RESUMEN */}
        <div style={{...styles.card, borderTop: '4px solid #3b82f6'}}>
          <h2 style={{...styles.cardTitle, color: '#60a5fa'}}>🧠 Resumen y Análisis</h2>
          <p style={styles.cardSubtitle}>Analiza hechos, cronología y sustento legal.</p>
          <input type="file" accept="application/pdf" onChange={(e) => setFileResumen(e.target.files[0])} style={styles.fileInput} />
          <button onClick={procesarResumen} disabled={loadingResumen} style={{...styles.button, backgroundColor: loadingResumen ? '#4b5563' : '#2563eb'}}>
            {loadingResumen ? "Analizando..." : "Generar Resumen"}
          </button>
          
          {resultadoResumen && (
            <div style={styles.resultBox}>
              <h3 style={{color: '#93c5fd', fontWeight: 'bold', marginBottom:'5px'}}>Resumen Cronológico:</h3>
              <p style={{marginBottom: '15px'}}>{resultadoResumen.resumenCronologico}</p>
              <h3 style={{color: '#93c5fd', fontWeight: 'bold', marginBottom:'5px'}}>Sustento Jurídico:</h3>
              <p style={{marginBottom: '15px'}}>{resultadoResumen.sustentoJuridico}</p>
              <button onClick={exportarResumen} style={{...styles.btnDownload, color: '#60a5fa', borderColor: '#60a5fa'}}>
                📄 Descargar Reporte PDF
              </button>
            </div>
          )}
        </div>

        {/* TARJETA 2: INVENTARIO */}
        <div style={{...styles.card, borderTop: '4px solid #10b981'}}>
          <h2 style={{...styles.cardTitle, color: '#34d399'}}>🕵️‍♂️ Elementos de Convicción</h2>
          <p style={styles.cardSubtitle}>Extrae documentos ignorando ruido procesal.</p>
          <input type="file" accept="application/pdf" onChange={(e) => setFileInventario(e.target.files[0])} style={styles.fileInput} />
          <button onClick={procesarInventario} disabled={loadingInventario} style={{...styles.button, backgroundColor: loadingInventario ? '#4b5563' : '#059669'}}>
            {loadingInventario ? "Extrayendo..." : "Generar Inventario"}
          </button>

          {resultadoInventario && resultadoInventario.elementosConviccionEncontrados && (
            <div style={styles.resultBox}>
              <p style={{color: '#6ee7b7', fontWeight: 'bold', marginBottom: '10px'}}>Total: {resultadoInventario.elementosConviccionEncontrados.length}</p>
              {resultadoInventario.elementosConviccionEncontrados.map((item, index) => (
                <div key={index} style={{marginBottom: '15px', borderBottom: '1px solid #4b5563', paddingBottom: '10px'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '5px'}}>
                    <strong style={{color: '#34d399'}}>{item.tipo}</strong>
                    <span style={{backgroundColor: '#4b5563', padding: '2px 8px', borderRadius: '10px', fontSize: '0.8rem'}}>Fojas: {item.paginaInicio} - {item.paginaFin}</span>
                  </div>
                  <p style={{margin: 0, color: '#d1d5db'}}>{item.descripcion}</p>
                </div>
              ))}
              <button onClick={exportarInventario} style={{...styles.btnDownload, color: '#34d399', borderColor: '#34d399'}}>
                📄 Descargar Reporte PDF
              </button>
            </div>
          )}
        </div>

        {/* TARJETA 3: DILIGENCIAS */}
        <div style={{...styles.card, borderTop: '4px solid #ef4444'}}>
          <h2 style={{...styles.cardTitle, color: '#f87171'}}>🎯 Diligencias Faltantes</h2>
          <p style={styles.cardSubtitle}>Identifica vacíos y sugiere actos procesales.</p>
          <input type="file" accept="application/pdf" onChange={(e) => setFileDiligencias(e.target.files[0])} style={styles.fileInput} />
          <button onClick={procesarDiligencias} disabled={loadingDiligencias} style={{...styles.button, backgroundColor: loadingDiligencias ? '#4b5563' : '#dc2626'}}>
            {loadingDiligencias ? "Evaluando..." : "Analizar Estrategia"}
          </button>

          {resultadoDiligencias && resultadoDiligencias.elementosFaltantes && (
            <div style={styles.resultBox}>
              <ul style={{paddingLeft: '20px', margin: 0}}>
                {resultadoDiligencias.elementosFaltantes.map((diligencia, index) => (
                  <li key={index} style={{marginBottom: '10px', color: '#fca5a5'}}><span style={{color: '#d1d5db'}}>{diligencia}</span></li>
                ))}
              </ul>
              <button onClick={exportarDiligencias} style={{...styles.btnDownload, color: '#f87171', borderColor: '#f87171'}}>
                📄 Descargar Reporte PDF
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}