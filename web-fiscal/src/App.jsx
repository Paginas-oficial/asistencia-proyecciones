import React, { useState } from 'react';
import { PDFDocument } from 'pdf-lib';

export default function FiscalDashboard() {
  const [vistaActual, setVistaActual] = useState('dashboard');

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

  const limpiarResumen = () => { setFilesResumen([]); setResultadoResumen(null); };
  const limpiarInventario = () => { setFilesInventario([]); setResultadoInventario(null); };
  const limpiarDiligencias = () => { setFilesDiligencias([]); setResultadoDiligencias(null); };

  // =====================================================================
  // LÓGICAS DE EXTRACCIÓN Y EXPORTACIÓN (Sin cambios)
  // =====================================================================
  const extraerPaginas = async (item) => {
    try {
      const archivoCorrecto = filesInventario.find(f => f.name === item.tomoOrigen);
      if (!archivoCorrecto) return alert(`No se encontró el archivo original (${item.tomoOrigen}).`);
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
    } catch (error) { alert("Error al cortar el PDF."); }
  };

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

  const exportarResumen = () => { generarPDF("Reporte de Resumen", `<h3>Cronológico</h3><p>${resultadoResumen.resumenCronologico}</p><h3>Sustento</h3><p>${resultadoResumen.sustentoJuridico}</p><h3>Éxito</h3><p><strong>${resultadoResumen.probabilidadExito}</strong></p>`); };
  const exportarInventario = () => {
    const itemsHtml = resultadoInventario.elementosConviccionEncontrados.map(item => `<div class="item"><strong>${item.tipo}</strong> (Fojas: ${item.paginaInicio} - ${item.paginaFin})<br/><small>Origen: ${item.tomoOrigen}</small><br/><p>${item.descripcion}</p></div>`).join('');
    generarPDF("Inventario de Elementos", `<h3>Total: ${resultadoInventario.elementosConviccionEncontrados.length}</h3>` + itemsHtml);
  };
  const exportarDiligencias = () => { generarPDF("Estrategia Faltante", resultadoDiligencias.elementosFaltantes.map(item => `<div class="item" style="border-left-color: #ef4444;">${item}</div>`).join('')); };

  // =====================================================================
  // MOTOR DE SUBIDA (Sin cambios)
  // =====================================================================
  const subirPartesYObtenerTickets = async (archivos) => {
    const tickets = [];
    for (let i = 0; i < archivos.length; i++) {
        const formData = new FormData();
        formData.append("documentoPdf", archivos[i]);
        const res = await fetch(`${API_BASE_URL}/subir-tomo`, { method: "POST", body: formData });
        if (!res.ok) throw new Error("Fallo al subir");
        tickets.push((await res.json()).ticket);
    }
    return tickets;
  };

  const procesarResumen = async () => {
    if (filesResumen.length === 0) return alert("Sube un PDF");
    setLoadingResumen(true); setResultadoResumen(null);
    try {
      const tickets = await subirPartesYObtenerTickets(filesResumen);
      const res = await fetch(`${API_BASE_URL}/resumen`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tickets }) });
      setResultadoResumen(await res.json()); setVistaActual('resumen');
    } catch (e) { alert("Error"); } finally { setLoadingResumen(false); }
  };

  const procesarInventario = async () => {
    if (filesInventario.length === 0) return alert("Sube un PDF");
    setLoadingInventario(true); setResultadoInventario(null);
    try {
      const tickets = await subirPartesYObtenerTickets(filesInventario);
      const res = await fetch(`${API_BASE_URL}/inventario`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tickets }) });
      setResultadoInventario(await res.json()); setVistaActual('inventario');
    } catch (e) { alert("Error"); } finally { setLoadingInventario(false); }
  };

  const procesarDiligencias = async () => {
    if (filesDiligencias.length === 0) return alert("Sube un PDF");
    setLoadingDiligencias(true); setResultadoDiligencias(null);
    try {
      const tickets = await subirPartesYObtenerTickets(filesDiligencias);
      const res = await fetch(`${API_BASE_URL}/diligencias`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tickets }) });
      setResultadoDiligencias(await res.json()); setVistaActual('diligencias');
    } catch (e) { alert("Error"); } finally { setLoadingDiligencias(false); }
  };

  // =====================================================================
  // ESTILOS EN LÍNEA BASE
  // =====================================================================
  const styles = {
    container: { backgroundColor: '#0a0d14', backgroundImage: 'radial-gradient(circle at 50% 0%, #172033 0%, #0a0d14 70%)', color: '#f8fafc', minHeight: '100vh', padding: '2rem', fontFamily: 'system-ui, sans-serif' },
    cardBase: { backgroundColor: 'rgba(30, 41, 59, 0.4)', backdropFilter: 'blur(16px)', padding: '2rem', borderRadius: '28px', border: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column', position: 'relative' },
    btnBack: { backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #475569', padding: '10px 20px', borderRadius: '12px', cursor: 'pointer', marginBottom: '20px', fontWeight: 'bold' },
    btnExtract: { backgroundColor: '#2563eb', color: '#fff', padding: '8px 16px', borderRadius: '10px', fontSize: '0.9rem', cursor: 'pointer', border: 'none', fontWeight: 'bold' },
    btnDownloadReport: { padding: '12px 24px', borderRadius: '12px', cursor: 'pointer', border: '1px solid', background: 'transparent', fontWeight: 'bold', display: 'inline-block', marginTop: '20px' }
  };

  // =====================================================================
  // RENDERIZADO (VISTAS DE RESULTADOS)
  // =====================================================================
  if (vistaActual === 'inventario' && resultadoInventario) {
    return (
      <div style={styles.container}>
        <button onClick={() => setVistaActual('dashboard')} style={styles.btnBack}>← Volver al Panel</button>
        <div style={{ ...styles.cardBase, maxWidth: '900px', margin: '0 auto', boxShadow: '0 0 40px rgba(16, 185, 129, 0.1)' }}>
          <h2 style={{ color: '#34d399', fontSize: '2rem', marginTop: 0 }}>🕵️‍♂️ Elementos Encontrados</h2>
          {resultadoInventario.elementosConviccionEncontrados?.map((item, index) => (
            <div key={index} style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '16px', marginBottom: '15px', borderLeft: '4px solid #34d399' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div><strong style={{ color: '#6ee7b7', fontSize: '1.2rem', display: 'block' }}>{item.tipo}</strong><span style={{ fontSize: '0.85rem', color: '#64748b' }}>Archivo: {item.tomoOrigen}</span></div>
                <button onClick={() => extraerPaginas(item)} style={styles.btnExtract}>📥 Bajar Págs. {item.paginaInicio} - {item.paginaFin}</button>
              </div>
              <p style={{ margin: '10px 0 0 0', color: '#cbd5e1' }}>{item.descripcion}</p>
            </div>
          ))}
          <button onClick={exportarInventario} style={{ ...styles.btnDownloadReport, color: '#34d399', borderColor: '#34d399' }}>📄 Descargar Reporte PDF</button>
        </div>
      </div>
    );
  }
  if (vistaActual === 'resumen' && resultadoResumen) { /* ... MISMO CÓDIGO DE RESUMEN ... */ }
  if (vistaActual === 'diligencias' && resultadoDiligencias) { /* ... MISMO CÓDIGO DE DILIGENCIAS ... */ }

  // =====================================================================
  // PANTALLA PRINCIPAL CON ANIMACIONES (NUEVO)
  // =====================================================================
  return (
    <div style={styles.container}>
      
      {/* 🌟 AQUÍ INYECTAMOS LAS ANIMACIONES CSS MÁGICAS 🌟 */}
      <style>
        {`
          /* Animación Hover para las tarjetas (Levitación y Brillo) */
          .tarjeta-animada {
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          }
          .tarjeta-azul:hover { transform: translateY(-8px) scale(1.02); box-shadow: 0 25px 50px -12px rgba(59, 130, 246, 0.4), inset 0 0 20px rgba(59, 130, 246, 0.1) !important; }
          .tarjeta-verde:hover { transform: translateY(-8px) scale(1.02); box-shadow: 0 25px 50px -12px rgba(16, 185, 129, 0.4), inset 0 0 20px rgba(16, 185, 129, 0.1) !important; }
          .tarjeta-roja:hover { transform: translateY(-8px) scale(1.02); box-shadow: 0 25px 50px -12px rgba(239, 68, 68, 0.4), inset 0 0 20px rgba(239, 68, 68, 0.1) !important; }

          /* Animación de Pulso (Respiración) para cuando está cargando */
          @keyframes pulse-anim {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(0.98); box-shadow: 0 0 20px currentColor; }
            100% { opacity: 1; transform: scale(1); }
          }
          .btn-cargando {
            animation: pulse-anim 1.5s infinite ease-in-out;
            cursor: wait !important;
            pointer-events: none;
          }

          /* Estilo elegante para la zona de subir archivos (Dropzone) */
          .file-input-wrapper {
            position: relative; overflow: hidden; display: inline-block; width: 100%;
            border: 1.5px dashed #475569; padding: 15px; border-radius: 12px; text-align: center;
            background: rgba(255,255,255,0.02); transition: 0.2s; cursor: pointer; margin-bottom: 1.5rem;
          }
          .file-input-wrapper:hover { border-color: #94a3b8; background: rgba(255,255,255,0.05); }
          .file-input-wrapper input[type="file"] {
            font-size: 100px; position: absolute; left: 0; top: 0; opacity: 0; cursor: pointer; height: 100%;
          }
          .file-label { color: #94a3b8; font-size: 0.9rem; font-weight: 500; pointer-events: none; }
          
          /* Estilo base de los botones */
          .btn-principal {
            width: 100%; padding: 0.85rem; border-radius: 14px; font-weight: bold; cursor: pointer;
            border: none; color: #fff; transition: 0.2s; text-transform: uppercase; letter-spacing: 0.5px;
          }
          .btn-principal:hover:not(:disabled) { filter: brightness(1.2); }
        `}
      </style>

      <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
        <h1 style={{ fontSize: '3rem', margin: '0', background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', color: 'transparent', letterSpacing: '-1px' }}>
          Sistema Fiscal
        </h1>
        <p style={{ color: '#64748b', fontSize: '1.2rem', marginTop: '10px' }}>Asistencia de Proyecciones Estratégicas</p>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2.5rem', maxWidth: '1300px', margin: '0 auto' }}>
        
        {/* TARJETA 1: AZUL (RESUMEN) */}
        <div className="tarjeta-animada tarjeta-azul" style={{ ...styles.cardBase, boxShadow: '0 15px 35px -5px rgba(59, 130, 246, 0.15)', borderTop: '2px solid rgba(59, 130, 246, 0.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '1.5rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>🧠</div>
            <h2 style={{ color: '#fff', fontSize: '1.4rem', margin: 0 }}>Resumen</h2>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '1.5rem', flexGrow: 1 }}>Analiza hechos, cronología y sustento legal del expediente.</p>
          
          {/* NUEVO: Input de archivo elegante */}
          <div className="file-input-wrapper">
            <span className="file-label">
              {filesResumen.length > 0 ? `📄 ${filesResumen.length} archivos cargados` : '📂 Haz clic para subir PDFs'}
            </span>
            <input id="input-resumen" type="file" multiple accept="application/pdf" onChange={(e) => setFilesResumen(Array.from(e.target.files))} />
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button 
              onClick={procesarResumen} 
              disabled={loadingResumen} 
              className={`btn-principal ${loadingResumen ? 'btn-cargando' : ''}`}
              style={{ backgroundColor: loadingResumen ? '#3b82f6' : '#2563eb', color: loadingResumen ? '#fff' : '#fff' }}
            >
              {loadingResumen ? "⏳ Analizando..." : "Generar Análisis"}
            </button>
            {resultadoResumen && <button onClick={() => setVistaActual('resumen')} className="btn-principal" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' }}>👁️ Ver Resultado</button>}
            <button onClick={limpiarResumen} style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', cursor: 'pointer', backgroundColor: 'transparent', border: '1px dashed rgba(255,255,255,0.2)', color: '#94a3b8', transition: '0.2s' }}>🧹 Limpiar</button>
          </div>
        </div>

        {/* TARJETA 2: VERDE (INVENTARIO) */}
        <div className="tarjeta-animada tarjeta-verde" style={{ ...styles.cardBase, boxShadow: '0 15px 35px -5px rgba(16, 185, 129, 0.15)', borderTop: '2px solid rgba(16, 185, 129, 0.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '1.5rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>🕵️‍♂️</div>
            <h2 style={{ color: '#fff', fontSize: '1.4rem', margin: 0 }}>Inventario</h2>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '1.5rem', flexGrow: 1 }}>Extrae pruebas e ignora el ruido procesal. Corta el PDF exacto.</p>
          
          <div className="file-input-wrapper">
            <span className="file-label">
              {filesInventario.length > 0 ? `📄 ${filesInventario.length} archivos cargados` : '📂 Haz clic para subir PDFs'}
            </span>
            <input id="input-inventario" type="file" multiple accept="application/pdf" onChange={(e) => setFilesInventario(Array.from(e.target.files))} />
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button 
              onClick={procesarInventario} 
              disabled={loadingInventario} 
              className={`btn-principal ${loadingInventario ? 'btn-cargando' : ''}`}
              style={{ backgroundColor: loadingInventario ? '#10b981' : '#059669', color: '#fff' }}
            >
              {loadingInventario ? "⏳ Extrayendo..." : "Generar Inventario"}
            </button>
            {resultadoInventario && <button onClick={() => setVistaActual('inventario')} className="btn-principal" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>👁️ Ver Resultado</button>}
            <button onClick={limpiarInventario} style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', cursor: 'pointer', backgroundColor: 'transparent', border: '1px dashed rgba(255,255,255,0.2)', color: '#94a3b8', transition: '0.2s' }}>🧹 Limpiar</button>
          </div>
        </div>

        {/* TARJETA 3: ROJO (DILIGENCIAS) */}
        <div className="tarjeta-animada tarjeta-roja" style={{ ...styles.cardBase, boxShadow: '0 15px 35px -5px rgba(239, 68, 68, 0.15)', borderTop: '2px solid rgba(239, 68, 68, 0.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '1.5rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>🎯</div>
            <h2 style={{ color: '#fff', fontSize: '1.4rem', margin: 0 }}>Diligencias</h2>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '1.5rem', flexGrow: 1 }}>Identifica vacíos y sugiere actos procesales para formalizar.</p>
          
          <div className="file-input-wrapper">
            <span className="file-label">
              {filesDiligencias.length > 0 ? `📄 ${filesDiligencias.length} archivos cargados` : '📂 Haz clic para subir PDFs'}
            </span>
            <input id="input-diligencias" type="file" multiple accept="application/pdf" onChange={(e) => setFilesDiligencias(Array.from(e.target.files))} />
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button 
              onClick={procesarDiligencias} 
              disabled={loadingDiligencias} 
              className={`btn-principal ${loadingDiligencias ? 'btn-cargando' : ''}`}
              style={{ backgroundColor: loadingDiligencias ? '#ef4444' : '#dc2626', color: '#fff' }}
            >
              {loadingDiligencias ? "⏳ Evaluando..." : "Analizar Estrategia"}
            </button>
            {resultadoDiligencias && <button onClick={() => setVistaActual('diligencias')} className="btn-principal" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}>👁️ Ver Resultado</button>}
            <button onClick={limpiarDiligencias} style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', cursor: 'pointer', backgroundColor: 'transparent', border: '1px dashed rgba(255,255,255,0.2)', color: '#94a3b8', transition: '0.2s' }}>🧹 Limpiar</button>
          </div>
        </div>

      </div>
    </div>
  );
}