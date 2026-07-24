import React, { useState } from 'react';
import { PDFDocument } from 'pdf-lib';

export default function FiscalDashboard() {
  // 🧭 GESTOR DE VISTAS (Pantallas independientes)
  // Puede ser: 'dashboard', 'resumen', 'inventario', 'diligencias'
  const [vistaActual, setVistaActual] = useState('dashboard');

  // 🧠 ESTADOS MULTI-ARCHIVO Y CARGA
  const [filesResumen, setFilesResumen] = useState([]);
  const [loadingResumen, setLoadingResumen] = useState(false);
  const [resultadoResumen, setResultadoResumen] = useState(null);

  const [filesInventario, setFilesInventario] = useState([]);
  const [loadingInventario, setLoadingInventario] = useState(false);
  const [resultadoInventario, setResultadoInventario] = useState(null);

  const [filesDiligencias, setFilesDiligencias] = useState([]);
  const [loadingDiligencias, setLoadingDiligencias] = useState(false);
  const [resultadoDiligencias, setResultadoDiligencias] = useState(null);

  const API_BASE_URL = "https://api-fiscal-backend.onrender.com/api";

  // =====================================================================
  // 1. LÓGICA DE EXTRACCIÓN DE PÁGINAS PDF (EL BOTÓN AZUL)
  // =====================================================================
  const extraerPaginas = async (item) => {
    try {
      const archivoCorrecto = filesInventario.find(f => f.name === item.tomoOrigen);
      if (!archivoCorrecto) {
        alert(`No se encontró el archivo original (${item.tomoOrigen}) para extraer las páginas.`);
        return;
      }

      const arrayBuffer = await archivoCorrecto.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pdfNuevo = await PDFDocument.create();

      let pagInicio = Math.max(1, item.paginaInicio);
      let pagFin = Math.min(pdfDoc.getPageCount(), item.paginaFin);

      const indices = [];
      for (let i = pagInicio - 1; i <= pagFin - 1; i++) { indices.push(i); }

      const paginasCopiadas = await pdfNuevo.copyPages(pdfDoc, indices);
      paginasCopiadas.forEach((pag) => pdfNuevo.addPage(pag));

      const pdfBytes = await pdfNuevo.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${item.tipo.replace(/[^a-zA-Z0-9]/g, '_')}_Pags_${pagInicio}-${pagFin}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error al extraer páginas:", error);
      alert("Error al cortar el PDF. Verifica que el archivo no esté protegido con contraseña.");
    }
  };

  // =====================================================================
  // 2. LÓGICA DE EXPORTACIÓN A REPORTE PDF (GLOBAL)
  // =====================================================================
  const generarPDF = (titulo, contenidoHTML) => {
    const ventana = window.open('', '_blank');
    ventana.document.write(`
      <html><head><title>${titulo}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #222; line-height: 1.6;}
        h1 { color: #1e3a8a; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
        .item { background: #f3f4f6; padding: 15px; margin-bottom: 15px; border-left: 5px solid #10b981; }
      </style></head><body><h1>${titulo}</h1>${contenidoHTML}
      <script>setTimeout(() => { window.print(); window.close(); }, 500);</script>
      </body></html>
    `);
    ventana.document.close();
  };

  const exportarResumen = () => {
    const html = `<h3>Resumen Cronológico</h3><p>${resultadoResumen.resumenCronologico}</p><h3>Sustento Jurídico</h3><p>${resultadoResumen.sustentoJuridico}</p><h3>Probabilidad de Éxito</h3><p><strong>${resultadoResumen.probabilidadExito}</strong></p>`;
    generarPDF("Reporte de Resumen y Análisis Jurídico", html);
  };

  const exportarInventario = () => {
    const itemsHtml = resultadoInventario.elementosConviccionEncontrados.map(item => `<div class="item"><strong>${item.tipo}</strong> (Fojas: ${item.paginaInicio} - ${item.paginaFin})<br/><small>Origen: ${item.tomoOrigen}</small><br/><p>${item.descripcion}</p></div>`).join('');
    generarPDF("Inventario de Elementos", `<h3>Total: ${resultadoInventario.elementosConviccionEncontrados.length}</h3>` + itemsHtml);
  };

  const exportarDiligencias = () => {
    const itemsHtml = resultadoDiligencias.elementosFaltantes.map(item => `<div class="item" style="border-left-color: #ef4444;">${item}</div>`).join('');
    generarPDF("Estrategia y Diligencias Faltantes", itemsHtml);
  };

  // =====================================================================
  // 3. MOTOR DE SUBIDA Y LLAMADAS AL BACKEND
  // =====================================================================
  const subirPartesYObtenerTickets = async (archivos) => {
    const tickets = [];
    for (let i = 0; i < archivos.length; i++) {
        const formData = new FormData();
        formData.append("documentoPdf", archivos[i]);
        const res = await fetch(`${API_BASE_URL}/subir-tomo`, { method: "POST", body: formData });
        if (!res.ok) throw new Error("Fallo al subir una parte");
        const data = await res.json();
        tickets.push(data.ticket);
    }
    return tickets;
  };

  const procesarResumen = async () => {
    if (filesResumen.length === 0) return alert("Sube al menos una parte del PDF");
    setLoadingResumen(true); setResultadoResumen(null);
    try {
      const tickets = await subirPartesYObtenerTickets(filesResumen);
      const respuesta = await fetch(`${API_BASE_URL}/resumen`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tickets }) });
      setResultadoResumen(await respuesta.json());
      setVistaActual('resumen'); // ¡Cambiamos de pantalla al terminar!
    } catch (error) { alert("Error en el proceso."); } finally { setLoadingResumen(false); }
  };

  const procesarInventario = async () => {
    if (filesInventario.length === 0) return alert("Sube al menos una parte del PDF");
    setLoadingInventario(true); setResultadoInventario(null);
    try {
      const tickets = await subirPartesYObtenerTickets(filesInventario);
      const respuesta = await fetch(`${API_BASE_URL}/inventario`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tickets }) });
      setResultadoInventario(await respuesta.json());
      setVistaActual('inventario'); // ¡Cambiamos de pantalla al terminar!
    } catch (error) { alert("Error en el proceso."); } finally { setLoadingInventario(false); }
  };

  const procesarDiligencias = async () => {
    if (filesDiligencias.length === 0) return alert("Sube al menos una parte del PDF");
    setLoadingDiligencias(true); setResultadoDiligencias(null);
    try {
      const tickets = await subirPartesYObtenerTickets(filesDiligencias);
      const respuesta = await fetch(`${API_BASE_URL}/diligencias`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tickets }) });
      setResultadoDiligencias(await respuesta.json());
      setVistaActual('diligencias'); // ¡Cambiamos de pantalla al terminar!
    } catch (error) { alert("Error en el proceso."); } finally { setLoadingDiligencias(false); }
  };

  // =====================================================================
  // 4. DISEÑO VISUAL GLOBAL
  // =====================================================================
  const styles = {
    container: { backgroundColor: '#0f172a', color: '#f8fafc', minHeight: '100vh', padding: '2rem', fontFamily: 'system-ui, sans-serif' },
    card: { backgroundColor: '#1e293b', padding: '1.5rem', borderRadius: '12px', border: '1px solid #334155', display: 'flex', flexDirection: 'column' },
    button: { width: '100%', padding: '0.75rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', border: 'none', color: '#fff', marginBottom: '1rem' },
    btnExtract: { backgroundColor: '#2563eb', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontSize: '0.9rem', cursor: 'pointer', border: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px', transition: '0.2s' },
    btnBack: { backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #475569', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', marginBottom: '20px', fontWeight: 'bold' },
    btnDownloadReport: { padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', border: '1px solid', background: 'transparent', fontWeight: 'bold', display: 'inline-block', marginTop: '20px' }
  };

  // =====================================================================
  // RENDERIZADO CONDICIONAL DE PANTALLAS
  // =====================================================================

  // PANTALLA 1: RESULTADOS DEL INVENTARIO (Pantalla limpia y amplia)
  if (vistaActual === 'inventario' && resultadoInventario) {
    return (
      <div style={styles.container}>
        <button onClick={() => setVistaActual('dashboard')} style={styles.btnBack}>← Volver al Panel Principal</button>
        <div style={{ maxWidth: '900px', margin: '0 auto', backgroundColor: '#1e293b', padding: '30px', borderRadius: '12px', borderTop: '5px solid #10b981' }}>
          <h2 style={{ color: '#34d399', fontSize: '2rem', marginTop: 0 }}>🕵️‍♂️ Elementos de Convicción Encontrados</h2>
          <p style={{ color: '#94a3b8', fontSize: '1.1rem', marginBottom: '30px' }}>Se extrajeron {resultadoInventario.elementosConviccionEncontrados?.length} elementos relevantes.</p>
          
          {resultadoInventario.elementosConviccionEncontrados?.map((item, index) => (
            <div key={index} style={{ backgroundColor: '#0f172a', padding: '20px', borderRadius: '8px', marginBottom: '20px', borderLeft: '4px solid #34d399' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <strong style={{ color: '#6ee7b7', fontSize: '1.3rem', display: 'block' }}>{item.tipo}</strong>
                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Archivo: {item.tomoOrigen}</span>
                </div>
                <button onClick={() => extraerPaginas(item)} style={styles.btnExtract}>
                  📥 Bajar Págs. {item.paginaInicio} - {item.paginaFin}
                </button>
              </div>
              <p style={{ margin: '15px 0 0 0', color: '#cbd5e1', fontSize: '1.05rem', lineHeight: '1.5' }}>{item.descripcion}</p>
            </div>
          ))}

          <button onClick={exportarInventario} style={{ ...styles.btnDownloadReport, color: '#34d399', borderColor: '#34d399' }}>
            📄 Descargar Reporte PDF para Carpeta Fiscal
          </button>
        </div>
      </div>
    );
  }

  // PANTALLA 2: RESULTADOS DE RESUMEN
  if (vistaActual === 'resumen' && resultadoResumen) {
    return (
      <div style={styles.container}>
        <button onClick={() => setVistaActual('dashboard')} style={styles.btnBack}>← Volver al Panel Principal</button>
        <div style={{ maxWidth: '900px', margin: '0 auto', backgroundColor: '#1e293b', padding: '30px', borderRadius: '12px', borderTop: '5px solid #3b82f6' }}>
          <h2 style={{ color: '#60a5fa', fontSize: '2rem', marginTop: 0 }}>🧠 Resumen y Análisis Jurídico</h2>
          
          <h3 style={{ color: '#93c5fd', marginTop: '20px' }}>Resumen Cronológico:</h3>
          <p style={{ color: '#cbd5e1', lineHeight: '1.7', fontSize: '1.1rem' }}>{resultadoResumen.resumenCronologico}</p>
          
          <h3 style={{ color: '#93c5fd', marginTop: '30px' }}>Sustento Jurídico:</h3>
          <p style={{ color: '#cbd5e1', lineHeight: '1.7', fontSize: '1.1rem' }}>{resultadoResumen.sustentoJuridico}</p>
          
          <h3 style={{ color: '#93c5fd', marginTop: '30px' }}>Probabilidad de Éxito:</h3>
          <span style={{ padding: '5px 15px', borderRadius: '20px', backgroundColor: '#2563eb', color: '#fff', fontWeight: 'bold' }}>
            {resultadoResumen.probabilidadExito}
          </span>

          <br/>
          <button onClick={exportarResumen} style={{ ...styles.btnDownloadReport, color: '#60a5fa', borderColor: '#60a5fa', marginTop: '40px' }}>
            📄 Descargar Reporte PDF
          </button>
        </div>
      </div>
    );
  }

  // PANTALLA 3: RESULTADOS DE DILIGENCIAS
  if (vistaActual === 'diligencias' && resultadoDiligencias) {
    return (
      <div style={styles.container}>
        <button onClick={() => setVistaActual('dashboard')} style={styles.btnBack}>← Volver al Panel Principal</button>
        <div style={{ maxWidth: '900px', margin: '0 auto', backgroundColor: '#1e293b', padding: '30px', borderRadius: '12px', borderTop: '5px solid #ef4444' }}>
          <h2 style={{ color: '#f87171', fontSize: '2rem', marginTop: 0 }}>🎯 Diligencias Faltantes Sugeridas</h2>
          <p style={{ color: '#94a3b8', fontSize: '1.1rem', marginBottom: '30px' }}>Se identificaron los siguientes vacíos en la investigación:</p>
          
          <ul style={{ paddingLeft: '20px' }}>
            {resultadoDiligencias.elementosFaltantes?.map((diligencia, index) => (
              <li key={index} style={{ marginBottom: '15px', color: '#fca5a5', fontSize: '1.1rem', lineHeight: '1.5' }}>
                <span style={{ color: '#cbd5e1' }}>{diligencia}</span>
              </li>
            ))}
          </ul>

          <button onClick={exportarDiligencias} style={{ ...styles.btnDownloadReport, color: '#f87171', borderColor: '#f87171' }}>
            📄 Descargar Reporte PDF
          </button>
        </div>
      </div>
    );
  }

  // =====================================================================
  // PANTALLA PRINCIPAL: EL DASHBOARD DE LAS 3 TARJETAS
  // =====================================================================
  // =====================================================================
  // PANTALLA PRINCIPAL: EL DASHBOARD DE LAS 3 TARJETAS
  // =====================================================================
  return (
    <div style={styles.container}>
      <h1 style={{ textAlign: 'center', marginBottom: '3rem', fontSize: '2.5rem' }}>Asistencia de Proyecciones Fiscales</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* TARJETA 1: RESUMEN */}
        <div style={{ ...styles.card, borderTop: '4px solid #3b82f6' }}>
          <h2 style={{ color: '#60a5fa', fontWeight: 'bold' }}>🧠 Resumen y Análisis</h2>
          <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>Analiza hechos, cronología y sustento legal.</p>
          <input type="file" multiple accept="application/pdf" onChange={(e) => setFilesResumen(Array.from(e.target.files))} style={{ marginBottom: '1rem', color: '#94a3b8' }} />
          {filesResumen.length > 0 && <span style={{ color: '#fbbf24', fontSize: '0.85rem', marginBottom: '1rem', display: 'block' }}>📁 {filesResumen.length} partes listas</span>}
          
          <div style={{ marginTop: 'auto' }}>
            <button onClick={procesarResumen} disabled={loadingResumen} style={{ ...styles.button, backgroundColor: loadingResumen ? '#475569' : '#2563eb', marginBottom: resultadoResumen ? '10px' : '0' }}>
              {loadingResumen ? "Analizando el expediente..." : "Generar Resumen"}
            </button>
            
            {/* NUEVO BOTÓN: VOLVER A RESUMEN */}
            {resultadoResumen && (
              <button onClick={() => setVistaActual('resumen')} style={{ ...styles.button, backgroundColor: 'transparent', border: '1px solid #60a5fa', color: '#60a5fa', marginBottom: '0' }}>
                👁️ Ver Resumen Anterior
              </button>
            )}
          </div>
        </div>

        {/* TARJETA 2: INVENTARIO PROBATORIO */}
        <div style={{ ...styles.card, borderTop: '4px solid #10b981' }}>
          <h2 style={{ color: '#34d399', fontWeight: 'bold' }}>🕵️‍♂️ Elementos de Convicción</h2>
          <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>Extrae documentos e ignora el ruido procesal. Corta el PDF exacto.</p>
          <input type="file" multiple accept="application/pdf" onChange={(e) => setFilesInventario(Array.from(e.target.files))} style={{ marginBottom: '1rem', color: '#94a3b8' }} />
          {filesInventario.length > 0 && <span style={{ color: '#fbbf24', fontSize: '0.85rem', marginBottom: '1rem', display: 'block' }}>📁 {filesInventario.length} partes listas</span>}
          
          <div style={{ marginTop: 'auto' }}>
            <button onClick={procesarInventario} disabled={loadingInventario} style={{ ...styles.button, backgroundColor: loadingInventario ? '#475569' : '#059669', marginBottom: resultadoInventario ? '10px' : '0' }}>
              {loadingInventario ? "Extrayendo pruebas..." : "Generar Inventario"}
            </button>

            {/* NUEVO BOTÓN: VOLVER A INVENTARIO */}
            {resultadoInventario && (
              <button onClick={() => setVistaActual('inventario')} style={{ ...styles.button, backgroundColor: 'transparent', border: '1px solid #34d399', color: '#34d399', marginBottom: '0' }}>
                👁️ Ver Elementos Extraídos
              </button>
            )}
          </div>
        </div>

        {/* TARJETA 3: DILIGENCIAS FALTANTES */}
        <div style={{ ...styles.card, borderTop: '4px solid #ef4444' }}>
          <h2 style={{ color: '#f87171', fontWeight: 'bold' }}>🎯 Diligencias Faltantes</h2>
          <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>Identifica vacíos y sugiere actos procesales para formalizar.</p>
          <input type="file" multiple accept="application/pdf" onChange={(e) => setFilesDiligencias(Array.from(e.target.files))} style={{ marginBottom: '1rem', color: '#94a3b8' }} />
          {filesDiligencias.length > 0 && <span style={{ color: '#fbbf24', fontSize: '0.85rem', marginBottom: '1rem', display: 'block' }}>📁 {filesDiligencias.length} partes listas</span>}
          
          <div style={{ marginTop: 'auto' }}>
            <button onClick={procesarDiligencias} disabled={loadingDiligencias} style={{ ...styles.button, backgroundColor: loadingDiligencias ? '#475569' : '#dc2626', marginBottom: resultadoDiligencias ? '10px' : '0' }}>
              {loadingDiligencias ? "Evaluando estrategia..." : "Analizar Estrategia"}
            </button>

            {/* NUEVO BOTÓN: VOLVER A DILIGENCIAS */}
            {resultadoDiligencias && (
              <button onClick={() => setVistaActual('diligencias')} style={{ ...styles.button, backgroundColor: 'transparent', border: '1px solid #f87171', color: '#f87171', marginBottom: '0' }}>
                👁️ Ver Estrategia Anterior
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}