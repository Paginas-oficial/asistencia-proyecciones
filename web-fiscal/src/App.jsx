import React, { useState } from 'react';
import { PDFDocument } from 'pdf-lib';

export default function FiscalDashboard() {
  // 🧭 GESTOR DE VISTAS
  const [vistaActual, setVistaActual] = useState('dashboard');

  // =====================================================================
  // 📂 ESTADOS PARA LA TARJETA PRINCIPAL (Arriba - Alta Calidad)
  // =====================================================================
  const [archivosGlobales, setArchivosGlobales] = useState([]);
  const [ticketsGlobales, setTicketsGlobales] = useState(null); 

  const [loadingResumen, setLoadingResumen] = useState(false);
  const [resultadoResumen, setResultadoResumen] = useState(null);

  const [loadingInventario, setLoadingInventario] = useState(false);
  const [resultadoInventario, setResultadoInventario] = useState(null);

  const [loadingDiligencias, setLoadingDiligencias] = useState(false);
  const [resultadoDiligencias, setResultadoDiligencias] = useState(null);

  // =====================================================================
  // 📂 ESTADOS INDEPENDIENTES PARA EL REDACTOR JURÍDICO (Abajo - Comprimidos)
  // =====================================================================
  const [archivosRedactor, setArchivosRedactor] = useState([]);
  const [ticketsRedactor, setTicketsRedactor] = useState(null);
  
  const [tipoDocumento, setTipoDocumento] = useState('Disposición de Archivo (No Ha Lugar)');
  const [instruccionRedactor, setInstruccionRedactor] = useState('');
  const [loadingRedactor, setLoadingRedactor] = useState(false);

  // ESTADOS PARA LOS MENSAJES DINÁMICOS
  const [mensajeResumen, setMensajeResumen] = useState("⏳ Analizando...");
  const [mensajeInventario, setMensajeInventario] = useState("⏳ Extrayendo...");
  const [mensajeDiligencias, setMensajeDiligencias] = useState("⏳ Evaluando...");
  const [mensajeRedactor, setMensajeRedactor] = useState("⏳ Redactando...");

  const API_BASE_URL = "https://api-fiscal-backend.onrender.com/api";

  const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // =====================================================================
  // MANEJO DE ARCHIVOS - EXPEDIENTE PRINCIPAL (ARRIBA)
  // =====================================================================
  const manejarSubidaArchivosGlobales = (e) => {
    setArchivosGlobales(Array.from(e.target.files));
    setTicketsGlobales(null); 
    setResultadoResumen(null);
    setResultadoInventario(null);
    setResultadoDiligencias(null);
  };

  const limpiarExpedienteGlobal = () => {
    setArchivosGlobales([]);
    setTicketsGlobales(null);
    setResultadoResumen(null);
    setResultadoInventario(null);
    setResultadoDiligencias(null);
    const input = document.getElementById('input-global');
    if (input) input.value = '';
  };

  const obtenerTicketsGlobales = async () => {
    if (ticketsGlobales) return ticketsGlobales;
    const tickets = [];
    for (let i = 0; i < archivosGlobales.length; i++) {
        const formData = new FormData();
        formData.append("documentoPdf", archivosGlobales[i]);
        const res = await fetch(`${API_BASE_URL}/subir-tomo`, { method: "POST", body: formData });
        if (!res.ok) throw new Error("Fallo al subir archivo");
        tickets.push((await res.json()).ticket);
    }
    setTicketsGlobales(tickets); 
    return tickets;
  };

  // =====================================================================
  // MANEJO DE ARCHIVOS - REDACTOR INDEPENDIENTE (ABAJO)
  // =====================================================================
  const manejarSubidaArchivosRedactor = (e) => {
    setArchivosRedactor(Array.from(e.target.files));
    setTicketsRedactor(null); // Borra los tickets viejos si cambian el archivo
  };

  const limpiarExpedienteRedactor = () => {
    setArchivosRedactor([]);
    setTicketsRedactor(null);
    const input = document.getElementById('input-redactor-file');
    if (input) input.value = '';
  };

  const obtenerTicketsRedactor = async () => {
    if (ticketsRedactor) return ticketsRedactor;
    const tickets = [];
    for (let i = 0; i < archivosRedactor.length; i++) {
        const formData = new FormData();
        formData.append("documentoPdf", archivosRedactor[i]);
        const res = await fetch(`${API_BASE_URL}/subir-tomo`, { method: "POST", body: formData });
        if (!res.ok) throw new Error("Fallo al subir archivo comprimido");
        tickets.push((await res.json()).ticket);
    }
    setTicketsRedactor(tickets); 
    return tickets;
  };

  // =====================================================================
  // 1. LÓGICA DE EXTRACCIÓN Y EXPORTACIÓN
  // =====================================================================
  const extraerPaginas = async (item) => {
    try {
      const archivoCorrecto = archivosGlobales.find(f => f.name === item.tomoOrigen);
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
  // 4. FUNCIONES DE PROCESAMIENTO
  // =====================================================================
  const procesarResumen = async () => {
    if (archivosGlobales.length === 0) return alert("Sube el expediente primero en la tarjeta superior.");
    setLoadingResumen(true); setResultadoResumen(null);
    for (let intento = 1; intento <= 5; intento++) {
      try {
        setMensajeResumen("⏳ Analizando...");
        const tickets = await obtenerTicketsGlobales();
        const res = await fetch(`${API_BASE_URL}/resumen`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tickets }) });
        if (!res.ok) throw new Error("Error"); 
        setResultadoResumen(await res.json()); 
        setVistaActual('resumen');
        setLoadingResumen(false); return;
      } catch (e) { 
        if (intento === 5) { alert("⚠️ Error de conexión."); setLoadingResumen(false); return; }
        for (let i = 60; i > 0; i--) { setMensajeResumen(`🔄 EN COLA. Reintento en ${i}s...`); await esperar(1000); }
      } 
    }
  };

  const procesarInventario = async () => {
    if (archivosGlobales.length === 0) return alert("Sube el expediente primero en la tarjeta superior.");
    setLoadingInventario(true); setResultadoInventario(null);
    for (let intento = 1; intento <= 5; intento++) {
      try {
        setMensajeInventario("⏳ Extrayendo...");
        const tickets = await obtenerTicketsGlobales();
        const res = await fetch(`${API_BASE_URL}/inventario`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tickets }) });
        if (!res.ok) throw new Error("Error"); 
        setResultadoInventario(await res.json()); 
        setVistaActual('inventario');
        setLoadingInventario(false); return; 
      } catch (e) { 
        if (intento === 5) { alert("⚠️ Error de conexión."); setLoadingInventario(false); return; }
        for (let i = 60; i > 0; i--) { setMensajeInventario(`🔄 EN COLA. Reintento en ${i}s...`); await esperar(1000); }
      } 
    }
  };

  const procesarDiligencias = async () => {
    if (archivosGlobales.length === 0) return alert("Sube el expediente primero en la tarjeta superior.");
    setLoadingDiligencias(true); setResultadoDiligencias(null);
    for (let intento = 1; intento <= 5; intento++) {
      try {
        setMensajeDiligencias("⏳ Evaluando...");
        const tickets = await obtenerTicketsGlobales();
        const res = await fetch(`${API_BASE_URL}/diligencias`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tickets }) });
        if (!res.ok) throw new Error("Error"); 
        setResultadoDiligencias(await res.json()); 
        setVistaActual('diligencias');
        setLoadingDiligencias(false); return;
      } catch (e) { 
        if (intento === 5) { alert("⚠️ Error de conexión."); setLoadingDiligencias(false); return; }
        for (let i = 60; i > 0; i--) { setMensajeDiligencias(`🔄 EN COLA. Reintento en ${i}s...`); await esperar(1000); }
      } 
    }
  };

  // NUEVA LÓGICA DEL REDACTOR (USA SU PROPIO ESTADO DE ARCHIVOS)
  const procesarRedactor = async () => {
    // AHORA VERIFICA EL ESTADO INDEPENDIENTE
    if (archivosRedactor.length === 0) return alert("Sube el expediente comprimido en la tarjeta morada primero.");
    
    setLoadingRedactor(true);
    const maxIntentos = 5;

    for (let intento = 1; intento <= maxIntentos; intento++) {
      try {
        setMensajeRedactor("⏳ Redactando...");
        // AHORA USA SUS PROPIOS TICKETS
        const tickets = await obtenerTicketsRedactor();
        
        const res = await fetch(`${API_BASE_URL}/generar-documento`, { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify({ tipoDocumento, instruccion: instruccionRedactor, tickets }) 
        });
        
        if (!res.ok) throw new Error("Error 503"); 

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Proyecto_${tipoDocumento.replace(/[^a-zA-Z0-9]/g, '_')}.docx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        
        setLoadingRedactor(false);
        return; 
      } catch (e) { 
        if (intento === maxIntentos) {
          alert("⚠️ Google sigue saturado. Por favor, espera un par de minutos y vuelve a intentarlo."); 
          setLoadingRedactor(false);
          return;
        }
        for (let i = 60; i > 0; i--) {
          setMensajeRedactor(`🔄 EN COLA. Reintento en ${i}s...`);
          await esperar(1000);
        }
      } 
    }
  };

  // =====================================================================
  // ESTILOS PREMIUM
  // =====================================================================
  const styles = {
    container: { backgroundColor: '#0a0d14', backgroundImage: 'radial-gradient(circle at 50% 0%, #172033 0%, #0a0d14 70%)', color: '#f8fafc', minHeight: '100vh', padding: '2rem', fontFamily: 'system-ui, sans-serif' },
    cardBase: { backgroundColor: 'rgba(30, 41, 59, 0.4)', backdropFilter: 'blur(16px)', padding: '2rem', borderRadius: '28px', border: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column', position: 'relative' },
    btnBack: { backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #475569', padding: '10px 20px', borderRadius: '12px', cursor: 'pointer', marginBottom: '20px', fontWeight: 'bold' },
    btnExtract: { backgroundColor: '#2563eb', color: '#fff', padding: '8px 16px', borderRadius: '10px', fontSize: '0.9rem', cursor: 'pointer', border: 'none', fontWeight: 'bold' },
    btnDownloadReport: { padding: '12px 24px', borderRadius: '12px', cursor: 'pointer', border: '1px solid', background: 'transparent', fontWeight: 'bold', display: 'inline-block', marginTop: '20px' }
  };

  // =====================================================================
  // VISTAS DE RESULTADOS (Se mantienen igual)
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

  return (
    <div style={styles.container}>
      <style>
        {`
          html, body { margin: 0; padding: 0; background-color: #0a0d14; min-height: 100vh; width: 100%; }
          * { box-sizing: border-box; }
          .tarjeta-animada { transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); }
          .tarjeta-azul:hover { transform: translateY(-5px); box-shadow: 0 25px 50px -12px rgba(59, 130, 246, 0.4), inset 0 0 20px rgba(59, 130, 246, 0.1) !important; }
          .tarjeta-verde:hover { transform: translateY(-5px); box-shadow: 0 25px 50px -12px rgba(16, 185, 129, 0.4), inset 0 0 20px rgba(16, 185, 129, 0.1) !important; }
          .tarjeta-roja:hover { transform: translateY(-5px); box-shadow: 0 25px 50px -12px rgba(239, 68, 68, 0.4), inset 0 0 20px rgba(239, 68, 68, 0.1) !important; }
          .tarjeta-morada:hover { transform: translateY(-5px); box-shadow: 0 25px 50px -12px rgba(139, 92, 246, 0.4), inset 0 0 20px rgba(139, 92, 246, 0.1) !important; }
          
          @keyframes pulse-anim { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(0.98); box-shadow: 0 0 20px currentColor; } 100% { opacity: 1; transform: scale(1); } }
          .btn-cargando { animation: pulse-anim 1.5s infinite ease-in-out; cursor: wait !important; pointer-events: none; }

          /* CAJAS DE SUBIDA GRISES (ARRIBA) */
          .file-input-wrapper { position: relative; overflow: hidden; display: block; width: 100%; border: 2px dashed #64748b; padding: 30px; border-radius: 16px; text-align: center; background: rgba(255,255,255,0.02); transition: 0.2s; cursor: pointer; }
          .file-input-wrapper:hover { border-color: #f8fafc; background: rgba(255,255,255,0.05); }
          .file-input-wrapper input[type="file"] { font-size: 100px; position: absolute; left: 0; top: 0; opacity: 0; cursor: pointer; height: 100%; width: 100%; }
          .file-label { color: #f8fafc; font-size: 1.1rem; font-weight: 500; pointer-events: none; }
          
          /* CAJA DE SUBIDA MORADA (ABAJO) */
          .file-input-wrapper-morado { position: relative; overflow: hidden; display: block; width: 100%; border: 2px dashed #8b5cf6; padding: 30px; border-radius: 16px; text-align: center; background: rgba(139, 92, 246, 0.05); transition: 0.2s; cursor: pointer; margin-bottom: 20px;}
          .file-input-wrapper-morado:hover { border-color: #a78bfa; background: rgba(139, 92, 246, 0.15); }
          .file-input-wrapper-morado input[type="file"] { font-size: 100px; position: absolute; left: 0; top: 0; opacity: 0; cursor: pointer; height: 100%; width: 100%; }
          .file-label-morado { color: #ddd6fe; font-size: 1.1rem; font-weight: 500; pointer-events: none; }

          .btn-principal { width: 100%; padding: 0.85rem; border-radius: 14px; font-weight: bold; cursor: pointer; border: none; color: #fff; transition: 0.2s; text-transform: uppercase; letter-spacing: 0.5px; }
          .btn-principal:hover:not(:disabled) { filter: brightness(1.2); }
          .btn-principal:disabled { opacity: 0.5; cursor: not-allowed; }
          
          .input-redactor { width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #475569; background: rgba(0,0,0,0.2); color: #fff; font-size: 0.95rem; margin-bottom: 10px; outline: none; transition: 0.3s; }
          .input-redactor:focus { border-color: #a78bfa; box-shadow: 0 0 10px rgba(139, 92, 246, 0.3); }
        `}
      </style>

      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '3rem', margin: '0', background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', color: 'transparent', letterSpacing: '-1px' }}>
          Sistema Fiscal
        </h1>
        <p style={{ color: '#64748b', fontSize: '1.2rem', marginTop: '10px' }}>Asistencia de Proyecciones Estratégicas</p>
      </div>

      {/* ================================================================= */}
      {/* TARJETA DE ALTA CALIDAD (ARRIBA) - SOLO PARA EXTRACCIÓN/ANÁLISIS */}
      {/* ================================================================= */}
      <div style={{ maxWidth: '800px', margin: '0 auto 3rem auto' }}>
        <div style={{ ...styles.cardBase, boxShadow: '0 10px 30px rgba(0,0,0,0.5)', borderTop: '2px solid rgba(255, 255, 255, 0.2)', textAlign: 'center' }}>
          <h2 style={{ color: '#fff', fontSize: '1.5rem', margin: '0 0 1rem 0' }}>📂 Expediente Original (Alta Calidad)</h2>
          <p style={{ color: '#94a3b8', fontSize: '1rem', marginBottom: '2rem' }}>Sube el PDF sin comprimir. Se usará para generar Resúmenes, Inventario y Cortar Fojas.</p>
          
          <div className="file-input-wrapper">
            <span className="file-label">
              {archivosGlobales.length > 0 
                ? `✅ ${archivosGlobales.length} archivo(s) de alta calidad listos` 
                : '📥 Haz clic aquí o arrastra los PDFs originales'}
            </span>
            <input id="input-global" type="file" multiple accept="application/pdf" onChange={manejarSubidaArchivosGlobales} />
          </div>

          {archivosGlobales.length > 0 && (
            <button onClick={limpiarExpedienteGlobal} style={{ marginTop: '1rem', padding: '0.6rem 1.5rem', borderRadius: '12px', cursor: 'pointer', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontWeight: 'bold' }}>
              🗑️ Cambiar Expediente Original
            </button>
          )}
        </div>
      </div>
      
      {/* ================================================================= */}
      {/* GRID DE HERRAMIENTAS RÁPIDAS (3 TARJETAS) */}
      {/* ================================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2.5rem', maxWidth: '1000px', margin: '0 auto 3rem auto' }}>
        
        {/* RESUMEN */}
        <div className="tarjeta-animada tarjeta-azul" style={{ ...styles.cardBase, boxShadow: '0 15px 35px -5px rgba(59, 130, 246, 0.15)', borderTop: '2px solid rgba(59, 130, 246, 0.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '1.5rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>🧠</div>
            <h2 style={{ color: '#fff', fontSize: '1.4rem', margin: 0 }}>Resumen</h2>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '2rem', flexGrow: 1 }}>Analiza hechos, cronología y sustento legal.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button onClick={procesarResumen} disabled={loadingResumen || archivosGlobales.length === 0} className={`btn-principal ${loadingResumen ? 'btn-cargando' : ''}`} style={{ backgroundColor: loadingResumen ? '#3b82f6' : '#2563eb' }}>
              {loadingResumen ? mensajeResumen : "Generar Análisis"}
            </button>
          </div>
        </div>

        {/* INVENTARIO */}
        <div className="tarjeta-animada tarjeta-verde" style={{ ...styles.cardBase, boxShadow: '0 15px 35px -5px rgba(16, 185, 129, 0.15)', borderTop: '2px solid rgba(16, 185, 129, 0.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '1.5rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>🕵️‍♂️</div>
            <h2 style={{ color: '#fff', fontSize: '1.4rem', margin: 0 }}>Inventario</h2>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '2rem', flexGrow: 1 }}>Extrae pruebas e ignora el ruido procesal.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button onClick={procesarInventario} disabled={loadingInventario || archivosGlobales.length === 0} className={`btn-principal ${loadingInventario ? 'btn-cargando' : ''}`} style={{ backgroundColor: loadingInventario ? '#10b981' : '#059669' }}>
              {loadingInventario ? mensajeInventario : "Generar Inventario"}
            </button>
          </div>
        </div>

        {/* DILIGENCIAS */}
        <div className="tarjeta-animada tarjeta-roja" style={{ ...styles.cardBase, boxShadow: '0 15px 35px -5px rgba(239, 68, 68, 0.15)', borderTop: '2px solid rgba(239, 68, 68, 0.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '1.5rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>🎯</div>
            <h2 style={{ color: '#fff', fontSize: '1.4rem', margin: 0 }}>Diligencias</h2>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '2rem', flexGrow: 1 }}>Sujiere actos procesales para formalizar.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button onClick={procesarDiligencias} disabled={loadingDiligencias || archivosGlobales.length === 0} className={`btn-principal ${loadingDiligencias ? 'btn-cargando' : ''}`} style={{ backgroundColor: loadingDiligencias ? '#ef4444' : '#dc2626' }}>
              {loadingDiligencias ? mensajeDiligencias : "Analizar Estrategia"}
            </button>
          </div>
        </div>

      </div>

      {/* ================================================================= */}
      {/* TARJETA INDEPENDIENTE DEL REDACTOR (ABAJO, TAMAÑO COMPLETO) */}
      {/* ================================================================= */}
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div className="tarjeta-animada tarjeta-morada" style={{ ...styles.cardBase, boxShadow: '0 15px 35px -5px rgba(139, 92, 246, 0.2)', borderTop: '2px solid rgba(139, 92, 246, 0.6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '1rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(139, 92, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>✍️</div>
            <h2 style={{ color: '#fff', fontSize: '1.5rem', margin: 0 }}>Redactor Jurídico Especializado</h2>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '1rem', marginBottom: '1.5rem' }}>
            Sube aquí los tomos <strong>extremadamente comprimidos</strong>. Esta herramienta procesará el volumen masivo de datos para redactar disposiciones completas en Word.
          </p>
          
          {/* INPUT DE ARCHIVO PROPIO PARA EL REDACTOR */}
          <div className="file-input-wrapper-morado">
            <span className="file-label-morado">
              {archivosRedactor.length > 0 
                ? `✅ ${archivosRedactor.length} archivo(s) comprimido(s) listo(s) para redactar` 
                : '📥 Haz clic o arrastra PDFs comprimidos aquí'}
            </span>
            <input id="input-redactor-file" type="file" multiple accept="application/pdf" onChange={manejarSubidaArchivosRedactor} />
          </div>

          {archivosRedactor.length > 0 && (
            <button onClick={limpiarExpedienteRedactor} style={{ marginBottom: '1.5rem', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', backgroundColor: 'transparent', border: '1px solid #64748b', color: '#94a3b8', fontWeight: 'bold' }}>
              🗑️ Limpiar PDFs Comprimidos
            </button>
          )}
          
          {/* CONTROLES DE INSTRUCCIÓN */}
          <select 
            value={tipoDocumento} 
            onChange={(e) => setTipoDocumento(e.target.value)} 
            className="input-redactor"
            style={{ fontWeight: 'bold', backgroundColor: 'rgba(139, 92, 246, 0.1)', cursor: 'pointer' }}
          >
            <option value="Disposición de Archivo (No Ha Lugar)">Disposición de Archivo (No Ha Lugar)</option>
            <option value="Disposición de Formalización">Disposición de Formalización</option>
            <option value="Requerimiento Acusatorio">Requerimiento Acusatorio</option>
          </select>

          <input 
            type="text" 
            placeholder='Instrucción específica o enfoques (Ej: "Aplica el Principio de Confianza")'
            value={instruccionRedactor}
            onChange={(e) => setInstruccionRedactor(e.target.value)}
            className="input-redactor"
          />
          
          <button onClick={procesarRedactor} disabled={loadingRedactor || archivosRedactor.length === 0} className={`btn-principal ${loadingRedactor ? 'btn-cargando' : ''}`} style={{ backgroundColor: loadingRedactor ? '#8b5cf6' : '#7c3aed', marginTop: '10px' }}>
            {loadingRedactor ? mensajeRedactor : "Generar Documento en Word"}
          </button>
          
        </div>
      </div>

    </div>
  );
}