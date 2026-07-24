import React, { useState } from 'react';
import { PDFDocument } from 'pdf-lib';

export default function FiscalDashboard() {
  // 🧭 GESTOR DE VISTAS
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
  // FUNCIONES DE LIMPIEZA
  // =====================================================================
  const limpiarResumen = () => {
    setFilesResumen([]);
    setResultadoResumen(null);
    const input = document.getElementById('input-resumen');
    if (input) input.value = '';
  };

  const limpiarInventario = () => {
    setFilesInventario([]);
    setResultadoInventario(null);
    const input = document.getElementById('input-inventario');
    if (input) input.value = '';
  };

  const limpiarDiligencias = () => {
    setFilesDiligencias([]);
    setResultadoDiligencias(null);
    const input = document.getElementById('input-diligencias');
    if (input) input.value = '';
  };

  // =====================================================================
  // 1. LÓGICA DE EXTRACCIÓN
  // =====================================================================
  const extraerPaginas = async (item) => {
    try {
      const archivoCorrecto = filesInventario.find(f => f.name === item.tomoOrigen);
      if (!archivoCorrecto) {
        alert(`No se encontró el archivo original (${item.tomoOrigen}).`);
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
      alert("Error al cortar el PDF. Verifica contraseñas.");
    }
  };

  // =====================================================================
  // 2. LÓGICA DE EXPORTACIÓN
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
    const html = `<h3>Cronológico</h3><p>${resultadoResumen.resumenCronologico}</p><h3>Sustento</h3><p>${resultadoResumen.sustentoJuridico}</p><h3>Éxito</h3><p><strong>${resultadoResumen.probabilidadExito}</strong></p>`;
    generarPDF("Reporte de Resumen", html);
  };

  const exportarInventario = () => {
    const itemsHtml = resultadoInventario.elementosConviccionEncontrados.map(item => `<div class="item"><strong>${item.tipo}</strong> (Fojas: ${item.paginaInicio} - ${item.paginaFin})<br/><small>Origen: ${item.tomoOrigen}</small><br/><p>${item.descripcion}</p></div>`).join('');
    generarPDF("Inventario de Elementos", `<h3>Total: ${resultadoInventario.elementosConviccionEncontrados.length}</h3>` + itemsHtml);
  };

  const exportarDiligencias = () => {
    const itemsHtml = resultadoDiligencias.elementosFaltantes.map(item => `<div class="item" style="border-left-color: #ef4444;">${item}</div>`).join('');
    generarPDF("Estrategia Faltante", itemsHtml);
  };

  // =====================================================================
  // 3. MOTOR DE SUBIDA
  // =====================================================================
  const subirPartesYObtenerTickets = async (archivos) => {
    const tickets = [];
    for (let i = 0; i < archivos.length; i++) {
        const formData = new FormData();
        formData.append("documentoPdf", archivos[i]);
        const res = await fetch(`${API_BASE_URL}/subir-tomo`, { method: "POST", body: formData });
        if (!res.ok) throw new Error("Fallo al subir");
        const data = await res.json();
        tickets.push(data.ticket);
    }
    return tickets;
  };

  const procesarResumen = async () => {
    if (filesResumen.length === 0) return alert("Sube un PDF");
    setLoadingResumen(true); setResultadoResumen(null);
    try {
      const tickets = await subirPartesYObtenerTickets(filesResumen);
      const res = await fetch(`${API_BASE_URL}/resumen`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tickets }) });
      setResultadoResumen(await res.json());
      setVistaActual('resumen');
    } catch (e) { alert("Error"); } finally { setLoadingResumen(false); }
  };

  const procesarInventario = async () => {
    if (filesInventario.length === 0) return alert("Sube un PDF");
    setLoadingInventario(true); setResultadoInventario(null);
    try {
      const tickets = await subirPartesYObtenerTickets(filesInventario);
      const res = await fetch(`${API_BASE_URL}/inventario`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tickets }) });
      setResultadoInventario(await res.json());
      setVistaActual('inventario');
    } catch (e) { alert("Error"); } finally { setLoadingInventario(false); }
  };

  const procesarDiligencias = async () => {
    if (filesDiligencias.length === 0) return alert("Sube un PDF");
    setLoadingDiligencias(true); setResultadoDiligencias(null);
    try {
      const tickets = await subirPartesYObtenerTickets(filesDiligencias);
      const res = await fetch(`${API_BASE_URL}/diligencias`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tickets }) });
      setResultadoDiligencias(await res.json());
      setVistaActual('diligencias');
    } catch (e) { alert("Error"); } finally { setLoadingDiligencias(false); }
  };

  // =====================================================================
  // 4. NUEVO DISEÑO VISUAL PREMIUM (Estilo Foto)
  // =====================================================================
  const styles = {
    // Fondo general más oscuro con un resplandor sutil en el centro superior
    container: { 
      backgroundColor: '#0a0d14', 
      backgroundImage: 'radial-gradient(circle at 50% 0%, #172033 0%, #0a0d14 70%)',
      color: '#f8fafc', 
      minHeight: '100vh', 
      padding: '2rem', 
      fontFamily: 'system-ui, sans-serif' 
    },
    // Estructura base de las tarjetas estilo "Glassmorphism"
    cardBase: { 
      backgroundColor: 'rgba(30, 41, 59, 0.4)', // Semi-transparente
      backdropFilter: 'blur(16px)', // Efecto cristal
      WebkitBackdropFilter: 'blur(16px)',
      padding: '2rem', 
      borderRadius: '28px', // Bordes redondeados como en tu imagen
      border: '1px solid rgba(255, 255, 255, 0.05)', 
      display: 'flex', 
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden'
    },
    button: { width: '100%', padding: '0.85rem', borderRadius: '14px', fontWeight: 'bold', cursor: 'pointer', border: 'none', color: '#fff', marginBottom: '1rem', transition: '0.2s', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.85rem' },
    btnExtract: { backgroundColor: '#2563eb', color: '#fff', padding: '8px 16px', borderRadius: '10px', fontSize: '0.9rem', cursor: 'pointer', border: 'none', fontWeight: 'bold' },
    btnBack: { backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #475569', padding: '10px 20px', borderRadius: '12px', cursor: 'pointer', marginBottom: '20px', fontWeight: 'bold' },
    btnDownloadReport: { padding: '12px 24px', borderRadius: '12px', cursor: 'pointer', border: '1px solid', background: 'transparent', fontWeight: 'bold', display: 'inline-block', marginTop: '20px' },
    btnClean: { width: '100%', padding: '0.6rem', borderRadius: '12px', cursor: 'pointer', backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: '0.85rem' }
  };

  // =====================================================================
  // RENDERIZADO CONDICIONAL DE PANTALLAS (RESULTADOS)
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

  if (vistaActual === 'resumen' && resultadoResumen) {
    return (
      <div style={styles.container}>
        <button onClick={() => setVistaActual('dashboard')} style={styles.btnBack}>← Volver al Panel</button>
        <div style={{ ...styles.cardBase, maxWidth: '900px', margin: '0 auto', boxShadow: '0 0 40px rgba(59, 130, 246, 0.1)' }}>
          <h2 style={{ color: '#60a5fa', fontSize: '2rem', marginTop: 0 }}>🧠 Análisis Jurídico</h2>
          <h3 style={{ color: '#93c5fd' }}>Resumen:</h3><p style={{ color: '#cbd5e1' }}>{resultadoResumen.resumenCronologico}</p>
          <h3 style={{ color: '#93c5fd' }}>Sustento:</h3><p style={{ color: '#cbd5e1' }}>{resultadoResumen.sustentoJuridico}</p>
          <h3 style={{ color: '#93c5fd' }}>Éxito:</h3><span style={{ padding: '8px 16px', borderRadius: '12px', backgroundColor: '#2563eb', color: '#fff', fontWeight: 'bold' }}>{resultadoResumen.probabilidadExito}</span>
          <br/><button onClick={exportarResumen} style={{ ...styles.btnDownloadReport, color: '#60a5fa', borderColor: '#60a5fa' }}>📄 Descargar Reporte PDF</button>
        </div>
      </div>
    );
  }

  if (vistaActual === 'diligencias' && resultadoDiligencias) {
    return (
      <div style={styles.container}>
        <button onClick={() => setVistaActual('dashboard')} style={styles.btnBack}>← Volver al Panel</button>
        <div style={{ ...styles.cardBase, maxWidth: '900px', margin: '0 auto', boxShadow: '0 0 40px rgba(239, 68, 68, 0.1)' }}>
          <h2 style={{ color: '#f87171', fontSize: '2rem', marginTop: 0 }}>🎯 Estrategia Faltante</h2>
          <ul>{resultadoDiligencias.elementosFaltantes?.map((diligencia, i) => <li key={i} style={{ color: '#fca5a5', marginBottom: '10px' }}>{diligencia}</li>)}</ul>
          <button onClick={exportarDiligencias} style={{ ...styles.btnDownloadReport, color: '#f87171', borderColor: '#f87171' }}>📄 Descargar Reporte PDF</button>
        </div>
      </div>
    );
  }

  // =====================================================================
  // PANTALLA PRINCIPAL: EL DASHBOARD DE LAS 3 TARJETAS NEÓN
  // =====================================================================
  return (
    <div style={styles.container}>
      <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
        <h1 style={{ fontSize: '3rem', margin: '0', background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', color: 'transparent', letterSpacing: '-1px' }}>
          Sistema Fiscal
        </h1>
        <p style={{ color: '#64748b', fontSize: '1.2rem', marginTop: '10px' }}>Asistencia de Proyecciones Estratégicas</p>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2.5rem', maxWidth: '1300px', margin: '0 auto' }}>
        
        {/* TARJETA 1: AZUL (RESUMEN) */}
        <div style={{ 
          ...styles.cardBase, 
          boxShadow: '0 15px 35px -5px rgba(59, 130, 246, 0.2), inset 0 0 20px rgba(59, 130, 246, 0.05)',
          borderTop: '1px solid rgba(59, 130, 246, 0.4)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '1.5rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>🧠</div>
            <h2 style={{ color: '#fff', fontSize: '1.4rem', margin: 0 }}>Resumen</h2>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '2rem' }}>Analiza hechos, cronología y sustento legal del expediente.</p>
          
          <input id="input-resumen" type="file" multiple accept="application/pdf" onChange={(e) => setFilesResumen(Array.from(e.target.files))} style={{ marginBottom: '1.5rem', color: '#94a3b8', fontSize: '0.9rem' }} />
          {filesResumen.length > 0 && <span style={{ color: '#60a5fa', fontSize: '0.85rem', marginBottom: '1rem', display: 'block', fontWeight: 'bold' }}>📁 {filesResumen.length} archivos listos</span>}
          
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button onClick={procesarResumen} disabled={loadingResumen} style={{ ...styles.button, backgroundColor: loadingResumen ? '#334155' : '#2563eb', boxShadow: loadingResumen ? 'none' : '0 4px 15px rgba(37, 99, 235, 0.4)' }}>
              {loadingResumen ? "Procesando..." : "Generar Análisis"}
            </button>
            {resultadoResumen && <button onClick={() => setVistaActual('resumen')} style={{ ...styles.button, backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' }}>👁️ Ver Resultado</button>}
            <button onClick={limpiarResumen} style={styles.btnClean}>🧹 Limpiar</button>
          </div>
        </div>

        {/* TARJETA 2: VERDE (INVENTARIO) */}
        <div style={{ 
          ...styles.cardBase, 
          boxShadow: '0 15px 35px -5px rgba(16, 185, 129, 0.2), inset 0 0 20px rgba(16, 185, 129, 0.05)',
          borderTop: '1px solid rgba(16, 185, 129, 0.4)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '1.5rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>🕵️‍♂️</div>
            <h2 style={{ color: '#fff', fontSize: '1.4rem', margin: 0 }}>Inventario</h2>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '2rem' }}>Extrae pruebas e ignora el ruido procesal. Corta el PDF exacto.</p>
          
          <input id="input-inventario" type="file" multiple accept="application/pdf" onChange={(e) => setFilesInventario(Array.from(e.target.files))} style={{ marginBottom: '1.5rem', color: '#94a3b8', fontSize: '0.9rem' }} />
          {filesInventario.length > 0 && <span style={{ color: '#34d399', fontSize: '0.85rem', marginBottom: '1rem', display: 'block', fontWeight: 'bold' }}>📁 {filesInventario.length} archivos listos</span>}
          
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button onClick={procesarInventario} disabled={loadingInventario} style={{ ...styles.button, backgroundColor: loadingInventario ? '#334155' : '#059669', boxShadow: loadingInventario ? 'none' : '0 4px 15px rgba(5, 150, 105, 0.4)' }}>
              {loadingInventario ? "Procesando..." : "Generar Inventario"}
            </button>
            {resultadoInventario && <button onClick={() => setVistaActual('inventario')} style={{ ...styles.button, backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>👁️ Ver Resultado</button>}
            <button onClick={limpiarInventario} style={styles.btnClean}>🧹 Limpiar</button>
          </div>
        </div>

        {/* TARJETA 3: ROJO (DILIGENCIAS) */}
        <div style={{ 
          ...styles.cardBase, 
          boxShadow: '0 15px 35px -5px rgba(239, 68, 68, 0.2), inset 0 0 20px rgba(239, 68, 68, 0.05)',
          borderTop: '1px solid rgba(239, 68, 68, 0.4)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '1.5rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>🎯</div>
            <h2 style={{ color: '#fff', fontSize: '1.4rem', margin: 0 }}>Diligencias</h2>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '2rem' }}>Identifica vacíos y sugiere actos procesales para formalizar.</p>
          
          <input id="input-diligencias" type="file" multiple accept="application/pdf" onChange={(e) => setFilesDiligencias(Array.from(e.target.files))} style={{ marginBottom: '1.5rem', color: '#94a3b8', fontSize: '0.9rem' }} />
          {filesDiligencias.length > 0 && <span style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: '1rem', display: 'block', fontWeight: 'bold' }}>📁 {filesDiligencias.length} archivos listos</span>}
          
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button onClick={procesarDiligencias} disabled={loadingDiligencias} style={{ ...styles.button, backgroundColor: loadingDiligencias ? '#334155' : '#dc2626', boxShadow: loadingDiligencias ? 'none' : '0 4px 15px rgba(220, 38, 38, 0.4)' }}>
              {loadingDiligencias ? "Procesando..." : "Analizar Estrategia"}
            </button>
            {resultadoDiligencias && <button onClick={() => setVistaActual('diligencias')} style={{ ...styles.button, backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}>👁️ Ver Resultado</button>}
            <button onClick={limpiarDiligencias} style={styles.btnClean}>🧹 Limpiar</button>
          </div>
        </div>

      </div>
    </div>
  );
}