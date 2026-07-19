import React, { useState } from 'react';

const ExtractorOCR = () => {
  const [archivo, setArchivo] = useState(null);
  
  // Tareas manuales y Cola
  const [instruccionActual, setInstruccionActual] = useState("");
  const [colaTareas, setColaTareas] = useState([]);
  const [borradorAcumulado, setBorradorAcumulado] = useState([]);
  
  // Estados para el Generador Automático
  const [totalPaginas, setTotalPaginas] = useState("");
  const [divisiones, setDivisiones] = useState("10"); // Por defecto 10, como pediste

  // Estados de control
  const [procesando, setProcesando] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState("");
  const [error, setError] = useState("");

  const BACKEND_URL = "https://api-fiscal-backend.onrender.com/api/transcribir-fojas";

  // 1. Agregar tarea manual
  const agregarALaCola = (e) => {
    e.preventDefault();
    if (!instruccionActual.trim()) return;
    setColaTareas([...colaTareas, instruccionActual]);
    setInstruccionActual(""); 
  };

  // 2. EL NUEVO GENERADOR AUTOMÁTICO DE TAREAS
  const generarLotesAutomaticos = (e) => {
    e.preventDefault();
    const total = parseInt(totalPaginas);
    const div = parseInt(divisiones);

    if (isNaN(total) || total <= 0) {
      return alert("Por favor, ingresa un número válido para el total de páginas.");
    }

    const paginasPorFragmento = Math.ceil(total / div);
    const nuevasTareas = [];

    for (let i = 0; i < div; i++) {
      const inicio = (i * paginasPorFragmento) + 1;
      const fin = Math.min((i + 1) * paginasPorFragmento, total);
      
      // Solo agregamos si el inicio no supera el total (por si sobran divisiones)
      if (inicio <= total) {
        nuevasTareas.push(`Transcribe la página ${inicio} a ${fin}`);
      }
    }

    // Añadimos las tareas generadas a la cola actual
    setColaTareas([...colaTareas, ...nuevasTareas]);
    setTotalPaginas(""); // Limpiamos el input
    alert(`Se agregaron ${nuevasTareas.length} instrucciones a la cola automáticamente.`);
  };

  // 3. Eliminar tarea de la cola
  const quitarDeLaCola = (index) => {
    const nuevaCola = colaTareas.filter((_, i) => i !== index);
    setColaTareas(nuevaCola);
  };

  // 4. Ejecutar la Cola (Intacto)
  const ejecutarColaAutomatica = async () => {
    if (!archivo) return alert("Por favor, sube un documento primero.");
    if (colaTareas.length === 0) return alert("Agrega al menos una instrucción a la cola.");

    setProcesando(true);
    setError("");

    for (let i = 0; i < colaTareas.length; i++) {
      const ordenActual = colaTareas[i];
      setMensajeEstado(`⏳ Procesando tarea ${i + 1} de ${colaTareas.length}: "${ordenActual}"...`);

      const formData = new FormData();
      formData.append("documento", archivo);
      formData.append("instruccion", ordenActual);

      try {
        const response = await fetch(BACKEND_URL, {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Fallo en la tarea ${i + 1}`);
        }

        setBorradorAcumulado(prev => [...prev, { 
          orden: ordenActual, 
          texto: data.texto 
        }]);

        if (i < colaTareas.length - 1) {
          setMensajeEstado(`⏸️ Pausa de seguridad antes de la siguiente tarea...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

      } catch (err) {
        setError(`Error en la tarea "${ordenActual}": ${err.message}. El proceso automático se detuvo.`);
        setProcesando(false);
        setMensajeEstado("");
        setColaTareas(colaTareas.slice(i)); 
        return; 
      }
    }

    setMensajeEstado("✅ ¡Todas las tareas de la cola fueron procesadas con éxito!");
    setColaTareas([]); 
    setProcesando(false);
    setTimeout(() => setMensajeEstado(""), 5000);
  };

  // 5. Exportador a Word (Intacto, con el filtro mágico)
  const exportarTodoAWord = () => {
    if (borradorAcumulado.length === 0) return;

    let contenidoHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Transcripciones</title></head>
      <body style="font-family: 'Arial', sans-serif; font-size: 11pt;">
        <h2 style="text-align: center; color: #000000;">Documento de Transcripciones (OCR)</h2>
        <br>
    `;

    borradorAcumulado.forEach((item, index) => {
      let textoLimpio = item.texto
        .replace(/\n{2,}/g, '</p><p style="text-align: justify; margin-bottom: 12px; line-height: 1.5;">')
        .replace(/\n/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      contenidoHtml += `
        <h4 style="color: #333333; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Fragmento ${index + 1} (${item.orden}):</h4>
        <p style="text-align: justify; margin-bottom: 12px; line-height: 1.5;">
          ${textoLimpio}
        </p>
        <br>
      `;
    });

    contenidoHtml += `</body></html>`;

    const blob = new Blob(['\ufeff', contenidoHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Transcripciones_Fiscales_${new Date().getTime()}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const limpiarBorrador = () => {
    if (window.confirm("¿Estás seguro de borrar todo el trabajo acumulado?")) {
      setBorradorAcumulado([]);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif', backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
      <h2 style={{ color: '#2c3e50', borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>
        ⚙️ Extractor OCR (Modo Automático)
      </h2>

      {/* 1. ZONA DE SUBIDA */}
      <div style={{ border: '2px dashed #bdc3c7', padding: '15px', textAlign: 'center', borderRadius: '8px', backgroundColor: '#f8f9fa', marginBottom: '20px' }}>
        <input 
          type="file" 
          accept=".pdf, image/*" 
          onChange={(e) => setArchivo(e.target.files[0])} 
          disabled={procesando}
        />
      </div>

      {/* ============================================================== */}
      {/* 2. NUEVO: GENERADOR AUTOMÁTICO EN ACORDEÓN */}
      {/* ============================================================== */}
      <details style={{ marginBottom: '20px', backgroundColor: '#e8f4f8', borderRadius: '8px', padding: '10px', border: '1px solid #bde0eb' }}>
        <summary style={{ fontWeight: 'bold', color: '#2980b9', cursor: 'pointer', outline: 'none', padding: '5px' }}>
          🚀 Creador Rápido de Instrucciones (División Automática)
        </summary>
        <form onSubmit={generarLotesAutomaticos} style={{ display: 'flex', gap: '15px', marginTop: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          
          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' }}>Total de páginas del PDF:</label>
            <input 
              type="number" 
              value={totalPaginas} 
              onChange={(e) => setTotalPaginas(e.target.value)} 
              placeholder="Ej: 100"
              style={{ width: '90%', padding: '8px', borderRadius: '5px', border: '1px solid #ccc' }}
              disabled={procesando}
            />
          </div>

          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' }}>¿En cuántas partes dividir?</label>
            <select 
              value={divisiones} 
              onChange={(e) => setDivisiones(e.target.value)}
              style={{ width: '95%', padding: '8px', borderRadius: '5px', border: '1px solid #ccc', backgroundColor: 'white' }}
              disabled={procesando}
            >
              {/* Opciones de acordeón a partir de 5 hasta 30 */}
              {[5, 10, 11, 12, 13, 14, 15, 20, 25, 30].map(num => (
                <option key={num} value={num}>{num} partes</option>
              ))}
            </select>
          </div>

          <button 
            type="submit" 
            disabled={procesando || !totalPaginas}
            style={{ padding: '9px 15px', backgroundColor: '#2980b9', color: 'white', border: 'none', borderRadius: '5px', cursor: (procesando || !totalPaginas) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
          >
            Generar Lista
          </button>
        </form>
        <p style={{ fontSize: '12px', color: '#7f8c8d', marginTop: '10px', fontStyle: 'italic' }}>
          Ejemplo: Si pones 100 páginas y 10 partes, se crearán 10 instrucciones de 10 páginas cada una automáticamente.
        </p>
      </details>
      {/* ============================================================== */}

      {/* 3. ZONA DE INSTRUCCIÓN MANUAL (Por si quiere algo muy específico) */}
      <form onSubmit={agregarALaCola} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input 
          type="text" 
          value={instruccionActual} 
          onChange={(e) => setInstruccionActual(e.target.value)} 
          placeholder='Añadir manual. Ej: Transcribe folio 45'
          style={{ flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '15px' }}
          disabled={procesando}
        />
        <button 
          type="submit" 
          disabled={procesando || !instruccionActual.trim()}
          style={{ padding: '10px 15px', backgroundColor: '#34495e', color: 'white', border: 'none', borderRadius: '5px', cursor: (procesando || !instruccionActual) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
        >
          ➕ Añadir Manual
        </button>
      </form>

      {/* 4. VISOR DE LA COLA */}
      {colaTareas.length > 0 && (
        <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #ffc107', marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#856404' }}>📋 Tareas en Cola por Ejecutar ({colaTareas.length}):</h4>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#856404', fontSize: '14px' }}>
            {colaTareas.map((tarea, index) => (
              <li key={index} style={{ marginBottom: '5px', display: 'flex', justifyContent: 'space-between' }}>
                <span>{index + 1}. {tarea}</span>
                {!procesando && (
                  <button onClick={() => quitarDeLaCola(index)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>✖ Quitar</button>
                )}
              </li>
            ))}
          </ul>
          
          <button 
            onClick={ejecutarColaAutomatica}
            disabled={procesando}
            style={{ marginTop: '15px', width: '100%', padding: '12px', backgroundColor: procesando ? '#95a5a6' : '#2980b9', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', fontSize: '16px', cursor: procesando ? 'wait' : 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
          >
            {procesando ? "⚙️ Ejecutando Cola..." : "▶️ Iniciar Procesamiento Automático"}
          </button>
        </div>
      )}

      {/* MENSAJES DE ESTADO */}
      {mensajeEstado && (
        <div style={{ textAlign: 'center', margin: '15px 0', padding: '10px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '5px', fontWeight: 'bold' }}>
          {mensajeEstado}
        </div>
      )}
      {error && <div style={{ color: '#e74c3c', backgroundColor: '#fadbd8', padding: '10px', borderRadius: '5px', fontWeight: 'bold', marginBottom: '15px' }}>{error}</div>}

      {/* 5. ZONA DE RESULTADOS (Intacto) */}
      {borradorAcumulado.length > 0 && (
        <div style={{ marginTop: '30px', borderTop: '2px dashed #bdc3c7', paddingTop: '20px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, color: '#27ae60' }}>
              📚 Fragmentos Listos: {borradorAcumulado.length}
            </h3>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={limpiarBorrador}
                disabled={procesando}
                style={{ padding: '10px 15px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '5px', cursor: procesando ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: procesando ? 0.5 : 1 }}
              >
                🗑️ Limpiar TODO
              </button>
              
              <button 
                onClick={exportarTodoAWord}
                disabled={procesando}
                style={{ padding: '10px 15px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '5px', cursor: procesando ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: procesando ? 0.5 : 1 }}
              >
                💾 Exportar a Word
              </button>
            </div>
          </div>
          
          <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}>
            {borradorAcumulado.map((item, index) => (
              <div key={index} style={{ marginBottom: '20px', backgroundColor: '#f1f5f9', padding: '15px', borderRadius: '8px', borderLeft: '5px solid #3498db' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#34495e' }}>Extraído: <span style={{color: '#7f8c8d'}}>{item.orden}</span></h4>
                <div style={{ fontFamily: 'monospace', fontSize: '14px', whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto', backgroundColor: 'white', padding: '10px', border: '1px solid #e2e8f0' }}>
                  {item.texto}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExtractorOCR;import React, { useState } from 'react';

const ExtractorOCR = () => {
  const [archivo, setArchivo] = useState(null);
  
  // Tareas manuales y Cola
  const [instruccionActual, setInstruccionActual] = useState("");
  const [colaTareas, setColaTareas] = useState([]);
  const [borradorAcumulado, setBorradorAcumulado] = useState([]);
  
  // Estados para el Generador Automático
  const [totalPaginas, setTotalPaginas] = useState("");
  const [divisiones, setDivisiones] = useState("10"); // Por defecto 10, como pediste

  // Estados de control
  const [procesando, setProcesando] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState("");
  const [error, setError] = useState("");

  const BACKEND_URL = "https://api-fiscal-backend.onrender.com/api/transcribir-fojas";

  // 1. Agregar tarea manual
  const agregarALaCola = (e) => {
    e.preventDefault();
    if (!instruccionActual.trim()) return;
    setColaTareas([...colaTareas, instruccionActual]);
    setInstruccionActual(""); 
  };

  // 2. EL NUEVO GENERADOR AUTOMÁTICO DE TAREAS
  const generarLotesAutomaticos = (e) => {
    e.preventDefault();
    const total = parseInt(totalPaginas);
    const div = parseInt(divisiones);

    if (isNaN(total) || total <= 0) {
      return alert("Por favor, ingresa un número válido para el total de páginas.");
    }

    const paginasPorFragmento = Math.ceil(total / div);
    const nuevasTareas = [];

    for (let i = 0; i < div; i++) {
      const inicio = (i * paginasPorFragmento) + 1;
      const fin = Math.min((i + 1) * paginasPorFragmento, total);
      
      // Solo agregamos si el inicio no supera el total (por si sobran divisiones)
      if (inicio <= total) {
        nuevasTareas.push(`Transcribe la página ${inicio} a ${fin}`);
      }
    }

    // Añadimos las tareas generadas a la cola actual
    setColaTareas([...colaTareas, ...nuevasTareas]);
    setTotalPaginas(""); // Limpiamos el input
    alert(`Se agregaron ${nuevasTareas.length} instrucciones a la cola automáticamente.`);
  };

  // 3. Eliminar tarea de la cola
  const quitarDeLaCola = (index) => {
    const nuevaCola = colaTareas.filter((_, i) => i !== index);
    setColaTareas(nuevaCola);
  };

  // 4. Ejecutar la Cola (Intacto)
  const ejecutarColaAutomatica = async () => {
    if (!archivo) return alert("Por favor, sube un documento primero.");
    if (colaTareas.length === 0) return alert("Agrega al menos una instrucción a la cola.");

    setProcesando(true);
    setError("");

    for (let i = 0; i < colaTareas.length; i++) {
      const ordenActual = colaTareas[i];
      setMensajeEstado(`⏳ Procesando tarea ${i + 1} de ${colaTareas.length}: "${ordenActual}"...`);

      const formData = new FormData();
      formData.append("documento", archivo);
      formData.append("instruccion", ordenActual);

      try {
        const response = await fetch(BACKEND_URL, {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Fallo en la tarea ${i + 1}`);
        }

        setBorradorAcumulado(prev => [...prev, { 
          orden: ordenActual, 
          texto: data.texto 
        }]);

        if (i < colaTareas.length - 1) {
          setMensajeEstado(`⏸️ Pausa de seguridad antes de la siguiente tarea...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

      } catch (err) {
        setError(`Error en la tarea "${ordenActual}": ${err.message}. El proceso automático se detuvo.`);
        setProcesando(false);
        setMensajeEstado("");
        setColaTareas(colaTareas.slice(i)); 
        return; 
      }
    }

    setMensajeEstado("✅ ¡Todas las tareas de la cola fueron procesadas con éxito!");
    setColaTareas([]); 
    setProcesando(false);
    setTimeout(() => setMensajeEstado(""), 5000);
  };

  // 5. Exportador a Word (Intacto, con el filtro mágico)
  const exportarTodoAWord = () => {
    if (borradorAcumulado.length === 0) return;

    let contenidoHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Transcripciones</title></head>
      <body style="font-family: 'Arial', sans-serif; font-size: 11pt;">
        <h2 style="text-align: center; color: #000000;">Documento de Transcripciones (OCR)</h2>
        <br>
    `;

    borradorAcumulado.forEach((item, index) => {
      let textoLimpio = item.texto
        .replace(/\n{2,}/g, '</p><p style="text-align: justify; margin-bottom: 12px; line-height: 1.5;">')
        .replace(/\n/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      contenidoHtml += `
        <h4 style="color: #333333; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Fragmento ${index + 1} (${item.orden}):</h4>
        <p style="text-align: justify; margin-bottom: 12px; line-height: 1.5;">
          ${textoLimpio}
        </p>
        <br>
      `;
    });

    contenidoHtml += `</body></html>`;

    const blob = new Blob(['\ufeff', contenidoHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Transcripciones_Fiscales_${new Date().getTime()}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const limpiarBorrador = () => {
    if (window.confirm("¿Estás seguro de borrar todo el trabajo acumulado?")) {
      setBorradorAcumulado([]);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif', backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
      <h2 style={{ color: '#2c3e50', borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>
        ⚙️ Extractor OCR (Modo Automático)
      </h2>

      {/* 1. ZONA DE SUBIDA */}
      <div style={{ border: '2px dashed #bdc3c7', padding: '15px', textAlign: 'center', borderRadius: '8px', backgroundColor: '#f8f9fa', marginBottom: '20px' }}>
        <input 
          type="file" 
          accept=".pdf, image/*" 
          onChange={(e) => setArchivo(e.target.files[0])} 
          disabled={procesando}
        />
      </div>

      {/* ============================================================== */}
      {/* 2. NUEVO: GENERADOR AUTOMÁTICO EN ACORDEÓN */}
      {/* ============================================================== */}
      <details style={{ marginBottom: '20px', backgroundColor: '#e8f4f8', borderRadius: '8px', padding: '10px', border: '1px solid #bde0eb' }}>
        <summary style={{ fontWeight: 'bold', color: '#2980b9', cursor: 'pointer', outline: 'none', padding: '5px' }}>
          🚀 Creador Rápido de Instrucciones (División Automática)
        </summary>
        <form onSubmit={generarLotesAutomaticos} style={{ display: 'flex', gap: '15px', marginTop: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          
          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' }}>Total de páginas del PDF:</label>
            <input 
              type="number" 
              value={totalPaginas} 
              onChange={(e) => setTotalPaginas(e.target.value)} 
              placeholder="Ej: 100"
              style={{ width: '90%', padding: '8px', borderRadius: '5px', border: '1px solid #ccc' }}
              disabled={procesando}
            />
          </div>

          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' }}>¿En cuántas partes dividir?</label>
            <select 
              value={divisiones} 
              onChange={(e) => setDivisiones(e.target.value)}
              style={{ width: '95%', padding: '8px', borderRadius: '5px', border: '1px solid #ccc', backgroundColor: 'white' }}
              disabled={procesando}
            >
              {/* Opciones de acordeón a partir de 5 hasta 30 */}
              {[5, 10, 11, 12, 13, 14, 15, 20, 25, 30].map(num => (
                <option key={num} value={num}>{num} partes</option>
              ))}
            </select>
          </div>

          <button 
            type="submit" 
            disabled={procesando || !totalPaginas}
            style={{ padding: '9px 15px', backgroundColor: '#2980b9', color: 'white', border: 'none', borderRadius: '5px', cursor: (procesando || !totalPaginas) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
          >
            Generar Lista
          </button>
        </form>
        <p style={{ fontSize: '12px', color: '#7f8c8d', marginTop: '10px', fontStyle: 'italic' }}>
          Ejemplo: Si pones 100 páginas y 10 partes, se crearán 10 instrucciones de 10 páginas cada una automáticamente.
        </p>
      </details>
      {/* ============================================================== */}

      {/* 3. ZONA DE INSTRUCCIÓN MANUAL (Por si quiere algo muy específico) */}
      <form onSubmit={agregarALaCola} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input 
          type="text" 
          value={instruccionActual} 
          onChange={(e) => setInstruccionActual(e.target.value)} 
          placeholder='Añadir manual. Ej: Transcribe folio 45'
          style={{ flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '15px' }}
          disabled={procesando}
        />
        <button 
          type="submit" 
          disabled={procesando || !instruccionActual.trim()}
          style={{ padding: '10px 15px', backgroundColor: '#34495e', color: 'white', border: 'none', borderRadius: '5px', cursor: (procesando || !instruccionActual) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
        >
          ➕ Añadir Manual
        </button>
      </form>

      {/* 4. VISOR DE LA COLA */}
      {colaTareas.length > 0 && (
        <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #ffc107', marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#856404' }}>📋 Tareas en Cola por Ejecutar ({colaTareas.length}):</h4>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#856404', fontSize: '14px' }}>
            {colaTareas.map((tarea, index) => (
              <li key={index} style={{ marginBottom: '5px', display: 'flex', justifyContent: 'space-between' }}>
                <span>{index + 1}. {tarea}</span>
                {!procesando && (
                  <button onClick={() => quitarDeLaCola(index)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>✖ Quitar</button>
                )}
              </li>
            ))}
          </ul>
          
          <button 
            onClick={ejecutarColaAutomatica}
            disabled={procesando}
            style={{ marginTop: '15px', width: '100%', padding: '12px', backgroundColor: procesando ? '#95a5a6' : '#2980b9', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', fontSize: '16px', cursor: procesando ? 'wait' : 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
          >
            {procesando ? "⚙️ Ejecutando Cola..." : "▶️ Iniciar Procesamiento Automático"}
          </button>
        </div>
      )}

      {/* MENSAJES DE ESTADO */}
      {mensajeEstado && (
        <div style={{ textAlign: 'center', margin: '15px 0', padding: '10px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '5px', fontWeight: 'bold' }}>
          {mensajeEstado}
        </div>
      )}
      {error && <div style={{ color: '#e74c3c', backgroundColor: '#fadbd8', padding: '10px', borderRadius: '5px', fontWeight: 'bold', marginBottom: '15px' }}>{error}</div>}

      {/* 5. ZONA DE RESULTADOS (Intacto) */}
      {borradorAcumulado.length > 0 && (
        <div style={{ marginTop: '30px', borderTop: '2px dashed #bdc3c7', paddingTop: '20px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, color: '#27ae60' }}>
              📚 Fragmentos Listos: {borradorAcumulado.length}
            </h3>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={limpiarBorrador}
                disabled={procesando}
                style={{ padding: '10px 15px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '5px', cursor: procesando ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: procesando ? 0.5 : 1 }}
              >
                🗑️ Limpiar TODO
              </button>
              
              <button 
                onClick={exportarTodoAWord}
                disabled={procesando}
                style={{ padding: '10px 15px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '5px', cursor: procesando ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: procesando ? 0.5 : 1 }}
              >
                💾 Exportar a Word
              </button>
            </div>
          </div>
          
          <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}>
            {borradorAcumulado.map((item, index) => (
              <div key={index} style={{ marginBottom: '20px', backgroundColor: '#f1f5f9', padding: '15px', borderRadius: '8px', borderLeft: '5px solid #3498db' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#34495e' }}>Extraído: <span style={{color: '#7f8c8d'}}>{item.orden}</span></h4>
                <div style={{ fontFamily: 'monospace', fontSize: '14px', whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto', backgroundColor: 'white', padding: '10px', border: '1px solid #e2e8f0' }}>
                  {item.texto}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExtractorOCR;import React, { useState } from 'react';

const ExtractorOCR = () => {
  const [archivo, setArchivo] = useState(null);
  
  // Tareas manuales y Cola
  const [instruccionActual, setInstruccionActual] = useState("");
  const [colaTareas, setColaTareas] = useState([]);
  const [borradorAcumulado, setBorradorAcumulado] = useState([]);
  
  // Estados para el Generador Automático
  const [totalPaginas, setTotalPaginas] = useState("");
  const [divisiones, setDivisiones] = useState("10"); // Por defecto 10, como pediste

  // Estados de control
  const [procesando, setProcesando] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState("");
  const [error, setError] = useState("");

  const BACKEND_URL = "https://api-fiscal-backend.onrender.com/api/transcribir-fojas";

  // 1. Agregar tarea manual
  const agregarALaCola = (e) => {
    e.preventDefault();
    if (!instruccionActual.trim()) return;
    setColaTareas([...colaTareas, instruccionActual]);
    setInstruccionActual(""); 
  };

  // 2. EL NUEVO GENERADOR AUTOMÁTICO DE TAREAS
  const generarLotesAutomaticos = (e) => {
    e.preventDefault();
    const total = parseInt(totalPaginas);
    const div = parseInt(divisiones);

    if (isNaN(total) || total <= 0) {
      return alert("Por favor, ingresa un número válido para el total de páginas.");
    }

    const paginasPorFragmento = Math.ceil(total / div);
    const nuevasTareas = [];

    for (let i = 0; i < div; i++) {
      const inicio = (i * paginasPorFragmento) + 1;
      const fin = Math.min((i + 1) * paginasPorFragmento, total);
      
      // Solo agregamos si el inicio no supera el total (por si sobran divisiones)
      if (inicio <= total) {
        nuevasTareas.push(`Transcribe la página ${inicio} a ${fin}`);
      }
    }

    // Añadimos las tareas generadas a la cola actual
    setColaTareas([...colaTareas, ...nuevasTareas]);
    setTotalPaginas(""); // Limpiamos el input
    alert(`Se agregaron ${nuevasTareas.length} instrucciones a la cola automáticamente.`);
  };

  // 3. Eliminar tarea de la cola
  const quitarDeLaCola = (index) => {
    const nuevaCola = colaTareas.filter((_, i) => i !== index);
    setColaTareas(nuevaCola);
  };

  // 4. Ejecutar la Cola (Intacto)
  const ejecutarColaAutomatica = async () => {
    if (!archivo) return alert("Por favor, sube un documento primero.");
    if (colaTareas.length === 0) return alert("Agrega al menos una instrucción a la cola.");

    setProcesando(true);
    setError("");

    for (let i = 0; i < colaTareas.length; i++) {
      const ordenActual = colaTareas[i];
      setMensajeEstado(`⏳ Procesando tarea ${i + 1} de ${colaTareas.length}: "${ordenActual}"...`);

      const formData = new FormData();
      formData.append("documento", archivo);
      formData.append("instruccion", ordenActual);

      try {
        const response = await fetch(BACKEND_URL, {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Fallo en la tarea ${i + 1}`);
        }

        setBorradorAcumulado(prev => [...prev, { 
          orden: ordenActual, 
          texto: data.texto 
        }]);

        if (i < colaTareas.length - 1) {
          setMensajeEstado(`⏸️ Pausa de seguridad antes de la siguiente tarea...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

      } catch (err) {
        setError(`Error en la tarea "${ordenActual}": ${err.message}. El proceso automático se detuvo.`);
        setProcesando(false);
        setMensajeEstado("");
        setColaTareas(colaTareas.slice(i)); 
        return; 
      }
    }

    setMensajeEstado("✅ ¡Todas las tareas de la cola fueron procesadas con éxito!");
    setColaTareas([]); 
    setProcesando(false);
    setTimeout(() => setMensajeEstado(""), 5000);
  };

  // 5. Exportador a Word (Intacto, con el filtro mágico)
  const exportarTodoAWord = () => {
    if (borradorAcumulado.length === 0) return;

    let contenidoHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Transcripciones</title></head>
      <body style="font-family: 'Arial', sans-serif; font-size: 11pt;">
        <h2 style="text-align: center; color: #000000;">Documento de Transcripciones (OCR)</h2>
        <br>
    `;

    borradorAcumulado.forEach((item, index) => {
      let textoLimpio = item.texto
        .replace(/\n{2,}/g, '</p><p style="text-align: justify; margin-bottom: 12px; line-height: 1.5;">')
        .replace(/\n/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      contenidoHtml += `
        <h4 style="color: #333333; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Fragmento ${index + 1} (${item.orden}):</h4>
        <p style="text-align: justify; margin-bottom: 12px; line-height: 1.5;">
          ${textoLimpio}
        </p>
        <br>
      `;
    });

    contenidoHtml += `</body></html>`;

    const blob = new Blob(['\ufeff', contenidoHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Transcripciones_Fiscales_${new Date().getTime()}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const limpiarBorrador = () => {
    if (window.confirm("¿Estás seguro de borrar todo el trabajo acumulado?")) {
      setBorradorAcumulado([]);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif', backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
      <h2 style={{ color: '#2c3e50', borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>
        ⚙️ Extractor OCR (Modo Automático)
      </h2>

      {/* 1. ZONA DE SUBIDA */}
      <div style={{ border: '2px dashed #bdc3c7', padding: '15px', textAlign: 'center', borderRadius: '8px', backgroundColor: '#f8f9fa', marginBottom: '20px' }}>
        <input 
          type="file" 
          accept=".pdf, image/*" 
          onChange={(e) => setArchivo(e.target.files[0])} 
          disabled={procesando}
        />
      </div>

      {/* ============================================================== */}
      {/* 2. NUEVO: GENERADOR AUTOMÁTICO EN ACORDEÓN */}
      {/* ============================================================== */}
      <details style={{ marginBottom: '20px', backgroundColor: '#e8f4f8', borderRadius: '8px', padding: '10px', border: '1px solid #bde0eb' }}>
        <summary style={{ fontWeight: 'bold', color: '#2980b9', cursor: 'pointer', outline: 'none', padding: '5px' }}>
          🚀 Creador Rápido de Instrucciones (División Automática)
        </summary>
        <form onSubmit={generarLotesAutomaticos} style={{ display: 'flex', gap: '15px', marginTop: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          
          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' }}>Total de páginas del PDF:</label>
            <input 
              type="number" 
              value={totalPaginas} 
              onChange={(e) => setTotalPaginas(e.target.value)} 
              placeholder="Ej: 100"
              style={{ width: '90%', padding: '8px', borderRadius: '5px', border: '1px solid #ccc' }}
              disabled={procesando}
            />
          </div>

          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' }}>¿En cuántas partes dividir?</label>
            <select 
              value={divisiones} 
              onChange={(e) => setDivisiones(e.target.value)}
              style={{ width: '95%', padding: '8px', borderRadius: '5px', border: '1px solid #ccc', backgroundColor: 'white' }}
              disabled={procesando}
            >
              {/* Opciones de acordeón a partir de 5 hasta 30 */}
              {[5, 10, 11, 12, 13, 14, 15, 20, 25, 30].map(num => (
                <option key={num} value={num}>{num} partes</option>
              ))}
            </select>
          </div>

          <button 
            type="submit" 
            disabled={procesando || !totalPaginas}
            style={{ padding: '9px 15px', backgroundColor: '#2980b9', color: 'white', border: 'none', borderRadius: '5px', cursor: (procesando || !totalPaginas) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
          >
            Generar Lista
          </button>
        </form>
        <p style={{ fontSize: '12px', color: '#7f8c8d', marginTop: '10px', fontStyle: 'italic' }}>
          Ejemplo: Si pones 100 páginas y 10 partes, se crearán 10 instrucciones de 10 páginas cada una automáticamente.
        </p>
      </details>
      {/* ============================================================== */}

      {/* 3. ZONA DE INSTRUCCIÓN MANUAL (Por si quiere algo muy específico) */}
      <form onSubmit={agregarALaCola} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input 
          type="text" 
          value={instruccionActual} 
          onChange={(e) => setInstruccionActual(e.target.value)} 
          placeholder='Añadir manual. Ej: Transcribe folio 45'
          style={{ flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '15px' }}
          disabled={procesando}
        />
        <button 
          type="submit" 
          disabled={procesando || !instruccionActual.trim()}
          style={{ padding: '10px 15px', backgroundColor: '#34495e', color: 'white', border: 'none', borderRadius: '5px', cursor: (procesando || !instruccionActual) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
        >
          ➕ Añadir Manual
        </button>
      </form>

      {/* 4. VISOR DE LA COLA */}
      {colaTareas.length > 0 && (
        <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #ffc107', marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#856404' }}>📋 Tareas en Cola por Ejecutar ({colaTareas.length}):</h4>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#856404', fontSize: '14px' }}>
            {colaTareas.map((tarea, index) => (
              <li key={index} style={{ marginBottom: '5px', display: 'flex', justifyContent: 'space-between' }}>
                <span>{index + 1}. {tarea}</span>
                {!procesando && (
                  <button onClick={() => quitarDeLaCola(index)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>✖ Quitar</button>
                )}
              </li>
            ))}
          </ul>
          
          <button 
            onClick={ejecutarColaAutomatica}
            disabled={procesando}
            style={{ marginTop: '15px', width: '100%', padding: '12px', backgroundColor: procesando ? '#95a5a6' : '#2980b9', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', fontSize: '16px', cursor: procesando ? 'wait' : 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
          >
            {procesando ? "⚙️ Ejecutando Cola..." : "▶️ Iniciar Procesamiento Automático"}
          </button>
        </div>
      )}

      {/* MENSAJES DE ESTADO */}
      {mensajeEstado && (
        <div style={{ textAlign: 'center', margin: '15px 0', padding: '10px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '5px', fontWeight: 'bold' }}>
          {mensajeEstado}
        </div>
      )}
      {error && <div style={{ color: '#e74c3c', backgroundColor: '#fadbd8', padding: '10px', borderRadius: '5px', fontWeight: 'bold', marginBottom: '15px' }}>{error}</div>}

      {/* 5. ZONA DE RESULTADOS (Intacto) */}
      {borradorAcumulado.length > 0 && (
        <div style={{ marginTop: '30px', borderTop: '2px dashed #bdc3c7', paddingTop: '20px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, color: '#27ae60' }}>
              📚 Fragmentos Listos: {borradorAcumulado.length}
            </h3>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={limpiarBorrador}
                disabled={procesando}
                style={{ padding: '10px 15px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '5px', cursor: procesando ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: procesando ? 0.5 : 1 }}
              >
                🗑️ Limpiar TODO
              </button>
              
              <button 
                onClick={exportarTodoAWord}
                disabled={procesando}
                style={{ padding: '10px 15px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '5px', cursor: procesando ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: procesando ? 0.5 : 1 }}
              >
                💾 Exportar a Word
              </button>
            </div>
          </div>
          
          <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}>
            {borradorAcumulado.map((item, index) => (
              <div key={index} style={{ marginBottom: '20px', backgroundColor: '#f1f5f9', padding: '15px', borderRadius: '8px', borderLeft: '5px solid #3498db' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#34495e' }}>Extraído: <span style={{color: '#7f8c8d'}}>{item.orden}</span></h4>
                <div style={{ fontFamily: 'monospace', fontSize: '14px', whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto', backgroundColor: 'white', padding: '10px', border: '1px solid #e2e8f0' }}>
                  {item.texto}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExtractorOCR;import React, { useState } from 'react';

const ExtractorOCR = () => {
  const [archivo, setArchivo] = useState(null);
  
  // Tareas manuales y Cola
  const [instruccionActual, setInstruccionActual] = useState("");
  const [colaTareas, setColaTareas] = useState([]);
  const [borradorAcumulado, setBorradorAcumulado] = useState([]);
  
  // Estados para el Generador Automático
  const [totalPaginas, setTotalPaginas] = useState("");
  const [divisiones, setDivisiones] = useState("10"); // Por defecto 10, como pediste

  // Estados de control
  const [procesando, setProcesando] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState("");
  const [error, setError] = useState("");

  const BACKEND_URL = "https://api-fiscal-backend.onrender.com/api/transcribir-fojas";

  // 1. Agregar tarea manual
  const agregarALaCola = (e) => {
    e.preventDefault();
    if (!instruccionActual.trim()) return;
    setColaTareas([...colaTareas, instruccionActual]);
    setInstruccionActual(""); 
  };

  // 2. EL NUEVO GENERADOR AUTOMÁTICO DE TAREAS
  const generarLotesAutomaticos = (e) => {
    e.preventDefault();
    const total = parseInt(totalPaginas);
    const div = parseInt(divisiones);

    if (isNaN(total) || total <= 0) {
      return alert("Por favor, ingresa un número válido para el total de páginas.");
    }

    const paginasPorFragmento = Math.ceil(total / div);
    const nuevasTareas = [];

    for (let i = 0; i < div; i++) {
      const inicio = (i * paginasPorFragmento) + 1;
      const fin = Math.min((i + 1) * paginasPorFragmento, total);
      
      // Solo agregamos si el inicio no supera el total (por si sobran divisiones)
      if (inicio <= total) {
        nuevasTareas.push(`Transcribe la página ${inicio} a ${fin}`);
      }
    }

    // Añadimos las tareas generadas a la cola actual
    setColaTareas([...colaTareas, ...nuevasTareas]);
    setTotalPaginas(""); // Limpiamos el input
    alert(`Se agregaron ${nuevasTareas.length} instrucciones a la cola automáticamente.`);
  };

  // 3. Eliminar tarea de la cola
  const quitarDeLaCola = (index) => {
    const nuevaCola = colaTareas.filter((_, i) => i !== index);
    setColaTareas(nuevaCola);
  };

  // 4. Ejecutar la Cola (Intacto)
  const ejecutarColaAutomatica = async () => {
    if (!archivo) return alert("Por favor, sube un documento primero.");
    if (colaTareas.length === 0) return alert("Agrega al menos una instrucción a la cola.");

    setProcesando(true);
    setError("");

    for (let i = 0; i < colaTareas.length; i++) {
      const ordenActual = colaTareas[i];
      setMensajeEstado(`⏳ Procesando tarea ${i + 1} de ${colaTareas.length}: "${ordenActual}"...`);

      const formData = new FormData();
      formData.append("documento", archivo);
      formData.append("instruccion", ordenActual);

      try {
        const response = await fetch(BACKEND_URL, {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Fallo en la tarea ${i + 1}`);
        }

        setBorradorAcumulado(prev => [...prev, { 
          orden: ordenActual, 
          texto: data.texto 
        }]);

        if (i < colaTareas.length - 1) {
          setMensajeEstado(`⏸️ Pausa de seguridad antes de la siguiente tarea...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

      } catch (err) {
        setError(`Error en la tarea "${ordenActual}": ${err.message}. El proceso automático se detuvo.`);
        setProcesando(false);
        setMensajeEstado("");
        setColaTareas(colaTareas.slice(i)); 
        return; 
      }
    }

    setMensajeEstado("✅ ¡Todas las tareas de la cola fueron procesadas con éxito!");
    setColaTareas([]); 
    setProcesando(false);
    setTimeout(() => setMensajeEstado(""), 5000);
  };

  // 5. Exportador a Word (Intacto, con el filtro mágico)
  const exportarTodoAWord = () => {
    if (borradorAcumulado.length === 0) return;

    let contenidoHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Transcripciones</title></head>
      <body style="font-family: 'Arial', sans-serif; font-size: 11pt;">
        <h2 style="text-align: center; color: #000000;">Documento de Transcripciones (OCR)</h2>
        <br>
    `;

    borradorAcumulado.forEach((item, index) => {
      let textoLimpio = item.texto
        .replace(/\n{2,}/g, '</p><p style="text-align: justify; margin-bottom: 12px; line-height: 1.5;">')
        .replace(/\n/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      contenidoHtml += `
        <h4 style="color: #333333; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Fragmento ${index + 1} (${item.orden}):</h4>
        <p style="text-align: justify; margin-bottom: 12px; line-height: 1.5;">
          ${textoLimpio}
        </p>
        <br>
      `;
    });

    contenidoHtml += `</body></html>`;

    const blob = new Blob(['\ufeff', contenidoHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Transcripciones_Fiscales_${new Date().getTime()}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const limpiarBorrador = () => {
    if (window.confirm("¿Estás seguro de borrar todo el trabajo acumulado?")) {
      setBorradorAcumulado([]);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif', backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
      <h2 style={{ color: '#2c3e50', borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>
        ⚙️ Extractor OCR (Modo Automático)
      </h2>

      {/* 1. ZONA DE SUBIDA */}
      <div style={{ border: '2px dashed #bdc3c7', padding: '15px', textAlign: 'center', borderRadius: '8px', backgroundColor: '#f8f9fa', marginBottom: '20px' }}>
        <input 
          type="file" 
          accept=".pdf, image/*" 
          onChange={(e) => setArchivo(e.target.files[0])} 
          disabled={procesando}
        />
      </div>

      {/* ============================================================== */}
      {/* 2. NUEVO: GENERADOR AUTOMÁTICO EN ACORDEÓN */}
      {/* ============================================================== */}
      <details style={{ marginBottom: '20px', backgroundColor: '#e8f4f8', borderRadius: '8px', padding: '10px', border: '1px solid #bde0eb' }}>
        <summary style={{ fontWeight: 'bold', color: '#2980b9', cursor: 'pointer', outline: 'none', padding: '5px' }}>
          🚀 Creador Rápido de Instrucciones (División Automática)
        </summary>
        <form onSubmit={generarLotesAutomaticos} style={{ display: 'flex', gap: '15px', marginTop: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          
          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' }}>Total de páginas del PDF:</label>
            <input 
              type="number" 
              value={totalPaginas} 
              onChange={(e) => setTotalPaginas(e.target.value)} 
              placeholder="Ej: 100"
              style={{ width: '90%', padding: '8px', borderRadius: '5px', border: '1px solid #ccc' }}
              disabled={procesando}
            />
          </div>

          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' }}>¿En cuántas partes dividir?</label>
            <select 
              value={divisiones} 
              onChange={(e) => setDivisiones(e.target.value)}
              style={{ width: '95%', padding: '8px', borderRadius: '5px', border: '1px solid #ccc', backgroundColor: 'white' }}
              disabled={procesando}
            >
              {/* Opciones de acordeón a partir de 5 hasta 30 */}
              {[5, 10, 11, 12, 13, 14, 15, 20, 25, 30].map(num => (
                <option key={num} value={num}>{num} partes</option>
              ))}
            </select>
          </div>

          <button 
            type="submit" 
            disabled={procesando || !totalPaginas}
            style={{ padding: '9px 15px', backgroundColor: '#2980b9', color: 'white', border: 'none', borderRadius: '5px', cursor: (procesando || !totalPaginas) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
          >
            Generar Lista
          </button>
        </form>
        <p style={{ fontSize: '12px', color: '#7f8c8d', marginTop: '10px', fontStyle: 'italic' }}>
          Ejemplo: Si pones 100 páginas y 10 partes, se crearán 10 instrucciones de 10 páginas cada una automáticamente.
        </p>
      </details>
      {/* ============================================================== */}

      {/* 3. ZONA DE INSTRUCCIÓN MANUAL (Por si quiere algo muy específico) */}
      <form onSubmit={agregarALaCola} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input 
          type="text" 
          value={instruccionActual} 
          onChange={(e) => setInstruccionActual(e.target.value)} 
          placeholder='Añadir manual. Ej: Transcribe folio 45'
          style={{ flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '15px' }}
          disabled={procesando}
        />
        <button 
          type="submit" 
          disabled={procesando || !instruccionActual.trim()}
          style={{ padding: '10px 15px', backgroundColor: '#34495e', color: 'white', border: 'none', borderRadius: '5px', cursor: (procesando || !instruccionActual) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
        >
          ➕ Añadir Manual
        </button>
      </form>

      {/* 4. VISOR DE LA COLA */}
      {colaTareas.length > 0 && (
        <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #ffc107', marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#856404' }}>📋 Tareas en Cola por Ejecutar ({colaTareas.length}):</h4>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#856404', fontSize: '14px' }}>
            {colaTareas.map((tarea, index) => (
              <li key={index} style={{ marginBottom: '5px', display: 'flex', justifyContent: 'space-between' }}>
                <span>{index + 1}. {tarea}</span>
                {!procesando && (
                  <button onClick={() => quitarDeLaCola(index)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>✖ Quitar</button>
                )}
              </li>
            ))}
          </ul>
          
          <button 
            onClick={ejecutarColaAutomatica}
            disabled={procesando}
            style={{ marginTop: '15px', width: '100%', padding: '12px', backgroundColor: procesando ? '#95a5a6' : '#2980b9', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', fontSize: '16px', cursor: procesando ? 'wait' : 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
          >
            {procesando ? "⚙️ Ejecutando Cola..." : "▶️ Iniciar Procesamiento Automático"}
          </button>
        </div>
      )}

      {/* MENSAJES DE ESTADO */}
      {mensajeEstado && (
        <div style={{ textAlign: 'center', margin: '15px 0', padding: '10px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '5px', fontWeight: 'bold' }}>
          {mensajeEstado}
        </div>
      )}
      {error && <div style={{ color: '#e74c3c', backgroundColor: '#fadbd8', padding: '10px', borderRadius: '5px', fontWeight: 'bold', marginBottom: '15px' }}>{error}</div>}

      {/* 5. ZONA DE RESULTADOS (Intacto) */}
      {borradorAcumulado.length > 0 && (
        <div style={{ marginTop: '30px', borderTop: '2px dashed #bdc3c7', paddingTop: '20px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, color: '#27ae60' }}>
              📚 Fragmentos Listos: {borradorAcumulado.length}
            </h3>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={limpiarBorrador}
                disabled={procesando}
                style={{ padding: '10px 15px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '5px', cursor: procesando ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: procesando ? 0.5 : 1 }}
              >
                🗑️ Limpiar TODO
              </button>
              
              <button 
                onClick={exportarTodoAWord}
                disabled={procesando}
                style={{ padding: '10px 15px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '5px', cursor: procesando ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: procesando ? 0.5 : 1 }}
              >
                💾 Exportar a Word
              </button>
            </div>
          </div>
          
          <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}>
            {borradorAcumulado.map((item, index) => (
              <div key={index} style={{ marginBottom: '20px', backgroundColor: '#f1f5f9', padding: '15px', borderRadius: '8px', borderLeft: '5px solid #3498db' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#34495e' }}>Extraído: <span style={{color: '#7f8c8d'}}>{item.orden}</span></h4>
                <div style={{ fontFamily: 'monospace', fontSize: '14px', whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto', backgroundColor: 'white', padding: '10px', border: '1px solid #e2e8f0' }}>
                  {item.texto}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExtractorOCR;import React, { useState } from 'react';

const ExtractorOCR = () => {
  const [archivo, setArchivo] = useState(null);
  
  // Tareas manuales y Cola
  const [instruccionActual, setInstruccionActual] = useState("");
  const [colaTareas, setColaTareas] = useState([]);
  const [borradorAcumulado, setBorradorAcumulado] = useState([]);
  
  // Estados para el Generador Automático
  const [totalPaginas, setTotalPaginas] = useState("");
  const [divisiones, setDivisiones] = useState("10"); // Por defecto 10, como pediste

  // Estados de control
  const [procesando, setProcesando] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState("");
  const [error, setError] = useState("");

  const BACKEND_URL = "https://api-fiscal-backend.onrender.com/api/transcribir-fojas";

  // 1. Agregar tarea manual
  const agregarALaCola = (e) => {
    e.preventDefault();
    if (!instruccionActual.trim()) return;
    setColaTareas([...colaTareas, instruccionActual]);
    setInstruccionActual(""); 
  };

  // 2. EL NUEVO GENERADOR AUTOMÁTICO DE TAREAS
  const generarLotesAutomaticos = (e) => {
    e.preventDefault();
    const total = parseInt(totalPaginas);
    const div = parseInt(divisiones);

    if (isNaN(total) || total <= 0) {
      return alert("Por favor, ingresa un número válido para el total de páginas.");
    }

    const paginasPorFragmento = Math.ceil(total / div);
    const nuevasTareas = [];

    for (let i = 0; i < div; i++) {
      const inicio = (i * paginasPorFragmento) + 1;
      const fin = Math.min((i + 1) * paginasPorFragmento, total);
      
      // Solo agregamos si el inicio no supera el total (por si sobran divisiones)
      if (inicio <= total) {
        nuevasTareas.push(`Transcribe la página ${inicio} a ${fin}`);
      }
    }

    // Añadimos las tareas generadas a la cola actual
    setColaTareas([...colaTareas, ...nuevasTareas]);
    setTotalPaginas(""); // Limpiamos el input
    alert(`Se agregaron ${nuevasTareas.length} instrucciones a la cola automáticamente.`);
  };

  // 3. Eliminar tarea de la cola
  const quitarDeLaCola = (index) => {
    const nuevaCola = colaTareas.filter((_, i) => i !== index);
    setColaTareas(nuevaCola);
  };

  // 4. Ejecutar la Cola (Intacto)
  const ejecutarColaAutomatica = async () => {
    if (!archivo) return alert("Por favor, sube un documento primero.");
    if (colaTareas.length === 0) return alert("Agrega al menos una instrucción a la cola.");

    setProcesando(true);
    setError("");

    for (let i = 0; i < colaTareas.length; i++) {
      const ordenActual = colaTareas[i];
      setMensajeEstado(`⏳ Procesando tarea ${i + 1} de ${colaTareas.length}: "${ordenActual}"...`);

      const formData = new FormData();
      formData.append("documento", archivo);
      formData.append("instruccion", ordenActual);

      try {
        const response = await fetch(BACKEND_URL, {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Fallo en la tarea ${i + 1}`);
        }

        setBorradorAcumulado(prev => [...prev, { 
          orden: ordenActual, 
          texto: data.texto 
        }]);

        if (i < colaTareas.length - 1) {
          setMensajeEstado(`⏸️ Pausa de seguridad antes de la siguiente tarea...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

      } catch (err) {
        setError(`Error en la tarea "${ordenActual}": ${err.message}. El proceso automático se detuvo.`);
        setProcesando(false);
        setMensajeEstado("");
        setColaTareas(colaTareas.slice(i)); 
        return; 
      }
    }

    setMensajeEstado("✅ ¡Todas las tareas de la cola fueron procesadas con éxito!");
    setColaTareas([]); 
    setProcesando(false);
    setTimeout(() => setMensajeEstado(""), 5000);
  };

  // 5. Exportador a Word (Intacto, con el filtro mágico)
  const exportarTodoAWord = () => {
    if (borradorAcumulado.length === 0) return;

    let contenidoHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Transcripciones</title></head>
      <body style="font-family: 'Arial', sans-serif; font-size: 11pt;">
        <h2 style="text-align: center; color: #000000;">Documento de Transcripciones (OCR)</h2>
        <br>
    `;

    borradorAcumulado.forEach((item, index) => {
      let textoLimpio = item.texto
        .replace(/\n{2,}/g, '</p><p style="text-align: justify; margin-bottom: 12px; line-height: 1.5;">')
        .replace(/\n/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      contenidoHtml += `
        <h4 style="color: #333333; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Fragmento ${index + 1} (${item.orden}):</h4>
        <p style="text-align: justify; margin-bottom: 12px; line-height: 1.5;">
          ${textoLimpio}
        </p>
        <br>
      `;
    });

    contenidoHtml += `</body></html>`;

    const blob = new Blob(['\ufeff', contenidoHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Transcripciones_Fiscales_${new Date().getTime()}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const limpiarBorrador = () => {
    if (window.confirm("¿Estás seguro de borrar todo el trabajo acumulado?")) {
      setBorradorAcumulado([]);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif', backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
      <h2 style={{ color: '#2c3e50', borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>
        ⚙️ Extractor OCR (Modo Automático)
      </h2>

      {/* 1. ZONA DE SUBIDA */}
      <div style={{ border: '2px dashed #bdc3c7', padding: '15px', textAlign: 'center', borderRadius: '8px', backgroundColor: '#f8f9fa', marginBottom: '20px' }}>
        <input 
          type="file" 
          accept=".pdf, image/*" 
          onChange={(e) => setArchivo(e.target.files[0])} 
          disabled={procesando}
        />
      </div>

      {/* ============================================================== */}
      {/* 2. NUEVO: GENERADOR AUTOMÁTICO EN ACORDEÓN */}
      {/* ============================================================== */}
      <details style={{ marginBottom: '20px', backgroundColor: '#e8f4f8', borderRadius: '8px', padding: '10px', border: '1px solid #bde0eb' }}>
        <summary style={{ fontWeight: 'bold', color: '#2980b9', cursor: 'pointer', outline: 'none', padding: '5px' }}>
          🚀 Creador Rápido de Instrucciones (División Automática)
        </summary>
        <form onSubmit={generarLotesAutomaticos} style={{ display: 'flex', gap: '15px', marginTop: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          
          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' }}>Total de páginas del PDF:</label>
            <input 
              type="number" 
              value={totalPaginas} 
              onChange={(e) => setTotalPaginas(e.target.value)} 
              placeholder="Ej: 100"
              style={{ width: '90%', padding: '8px', borderRadius: '5px', border: '1px solid #ccc' }}
              disabled={procesando}
            />
          </div>

          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' }}>¿En cuántas partes dividir?</label>
            <select 
              value={divisiones} 
              onChange={(e) => setDivisiones(e.target.value)}
              style={{ width: '95%', padding: '8px', borderRadius: '5px', border: '1px solid #ccc', backgroundColor: 'white' }}
              disabled={procesando}
            >
              {/* Opciones de acordeón a partir de 5 hasta 30 */}
              {[5, 10, 11, 12, 13, 14, 15, 20, 25, 30].map(num => (
                <option key={num} value={num}>{num} partes</option>
              ))}
            </select>
          </div>

          <button 
            type="submit" 
            disabled={procesando || !totalPaginas}
            style={{ padding: '9px 15px', backgroundColor: '#2980b9', color: 'white', border: 'none', borderRadius: '5px', cursor: (procesando || !totalPaginas) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
          >
            Generar Lista
          </button>
        </form>
        <p style={{ fontSize: '12px', color: '#7f8c8d', marginTop: '10px', fontStyle: 'italic' }}>
          Ejemplo: Si pones 100 páginas y 10 partes, se crearán 10 instrucciones de 10 páginas cada una automáticamente.
        </p>
      </details>
      {/* ============================================================== */}

      {/* 3. ZONA DE INSTRUCCIÓN MANUAL (Por si quiere algo muy específico) */}
      <form onSubmit={agregarALaCola} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input 
          type="text" 
          value={instruccionActual} 
          onChange={(e) => setInstruccionActual(e.target.value)} 
          placeholder='Añadir manual. Ej: Transcribe folio 45'
          style={{ flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '15px' }}
          disabled={procesando}
        />
        <button 
          type="submit" 
          disabled={procesando || !instruccionActual.trim()}
          style={{ padding: '10px 15px', backgroundColor: '#34495e', color: 'white', border: 'none', borderRadius: '5px', cursor: (procesando || !instruccionActual) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
        >
          ➕ Añadir Manual
        </button>
      </form>

      {/* 4. VISOR DE LA COLA */}
      {colaTareas.length > 0 && (
        <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #ffc107', marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#856404' }}>📋 Tareas en Cola por Ejecutar ({colaTareas.length}):</h4>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#856404', fontSize: '14px' }}>
            {colaTareas.map((tarea, index) => (
              <li key={index} style={{ marginBottom: '5px', display: 'flex', justifyContent: 'space-between' }}>
                <span>{index + 1}. {tarea}</span>
                {!procesando && (
                  <button onClick={() => quitarDeLaCola(index)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>✖ Quitar</button>
                )}
              </li>
            ))}
          </ul>
          
          <button 
            onClick={ejecutarColaAutomatica}
            disabled={procesando}
            style={{ marginTop: '15px', width: '100%', padding: '12px', backgroundColor: procesando ? '#95a5a6' : '#2980b9', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', fontSize: '16px', cursor: procesando ? 'wait' : 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
          >
            {procesando ? "⚙️ Ejecutando Cola..." : "▶️ Iniciar Procesamiento Automático"}
          </button>
        </div>
      )}

      {/* MENSAJES DE ESTADO */}
      {mensajeEstado && (
        <div style={{ textAlign: 'center', margin: '15px 0', padding: '10px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '5px', fontWeight: 'bold' }}>
          {mensajeEstado}
        </div>
      )}
      {error && <div style={{ color: '#e74c3c', backgroundColor: '#fadbd8', padding: '10px', borderRadius: '5px', fontWeight: 'bold', marginBottom: '15px' }}>{error}</div>}

      {/* 5. ZONA DE RESULTADOS (Intacto) */}
      {borradorAcumulado.length > 0 && (
        <div style={{ marginTop: '30px', borderTop: '2px dashed #bdc3c7', paddingTop: '20px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, color: '#27ae60' }}>
              📚 Fragmentos Listos: {borradorAcumulado.length}
            </h3>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={limpiarBorrador}
                disabled={procesando}
                style={{ padding: '10px 15px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '5px', cursor: procesando ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: procesando ? 0.5 : 1 }}
              >
                🗑️ Limpiar TODO
              </button>
              
              <button 
                onClick={exportarTodoAWord}
                disabled={procesando}
                style={{ padding: '10px 15px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '5px', cursor: procesando ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: procesando ? 0.5 : 1 }}
              >
                💾 Exportar a Word
              </button>
            </div>
          </div>
          
          <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}>
            {borradorAcumulado.map((item, index) => (
              <div key={index} style={{ marginBottom: '20px', backgroundColor: '#f1f5f9', padding: '15px', borderRadius: '8px', borderLeft: '5px solid #3498db' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#34495e' }}>Extraído: <span style={{color: '#7f8c8d'}}>{item.orden}</span></h4>
                <div style={{ fontFamily: 'monospace', fontSize: '14px', whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto', backgroundColor: 'white', padding: '10px', border: '1px solid #e2e8f0' }}>
                  {item.texto}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExtractorOCR;import React, { useState } from 'react';

const ExtractorOCR = () => {
  const [archivo, setArchivo] = useState(null);
  
  // Tareas manuales y Cola
  const [instruccionActual, setInstruccionActual] = useState("");
  const [colaTareas, setColaTareas] = useState([]);
  const [borradorAcumulado, setBorradorAcumulado] = useState([]);
  
  // Estados para el Generador Automático
  const [totalPaginas, setTotalPaginas] = useState("");
  const [divisiones, setDivisiones] = useState("10"); // Por defecto 10, como pediste

  // Estados de control
  const [procesando, setProcesando] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState("");
  const [error, setError] = useState("");

  const BACKEND_URL = "https://api-fiscal-backend.onrender.com/api/transcribir-fojas";

  // 1. Agregar tarea manual
  const agregarALaCola = (e) => {
    e.preventDefault();
    if (!instruccionActual.trim()) return;
    setColaTareas([...colaTareas, instruccionActual]);
    setInstruccionActual(""); 
  };

  // 2. EL NUEVO GENERADOR AUTOMÁTICO DE TAREAS
  const generarLotesAutomaticos = (e) => {
    e.preventDefault();
    const total = parseInt(totalPaginas);
    const div = parseInt(divisiones);

    if (isNaN(total) || total <= 0) {
      return alert("Por favor, ingresa un número válido para el total de páginas.");
    }

    const paginasPorFragmento = Math.ceil(total / div);
    const nuevasTareas = [];

    for (let i = 0; i < div; i++) {
      const inicio = (i * paginasPorFragmento) + 1;
      const fin = Math.min((i + 1) * paginasPorFragmento, total);
      
      // Solo agregamos si el inicio no supera el total (por si sobran divisiones)
      if (inicio <= total) {
        nuevasTareas.push(`Transcribe la página ${inicio} a ${fin}`);
      }
    }

    // Añadimos las tareas generadas a la cola actual
    setColaTareas([...colaTareas, ...nuevasTareas]);
    setTotalPaginas(""); // Limpiamos el input
    alert(`Se agregaron ${nuevasTareas.length} instrucciones a la cola automáticamente.`);
  };

  // 3. Eliminar tarea de la cola
  const quitarDeLaCola = (index) => {
    const nuevaCola = colaTareas.filter((_, i) => i !== index);
    setColaTareas(nuevaCola);
  };

  // 4. Ejecutar la Cola (Intacto)
  const ejecutarColaAutomatica = async () => {
    if (!archivo) return alert("Por favor, sube un documento primero.");
    if (colaTareas.length === 0) return alert("Agrega al menos una instrucción a la cola.");

    setProcesando(true);
    setError("");

    for (let i = 0; i < colaTareas.length; i++) {
      const ordenActual = colaTareas[i];
      setMensajeEstado(`⏳ Procesando tarea ${i + 1} de ${colaTareas.length}: "${ordenActual}"...`);

      const formData = new FormData();
      formData.append("documento", archivo);
      formData.append("instruccion", ordenActual);

      try {
        const response = await fetch(BACKEND_URL, {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Fallo en la tarea ${i + 1}`);
        }

        setBorradorAcumulado(prev => [...prev, { 
          orden: ordenActual, 
          texto: data.texto 
        }]);

        if (i < colaTareas.length - 1) {
          setMensajeEstado(`⏸️ Pausa de seguridad antes de la siguiente tarea...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

      } catch (err) {
        setError(`Error en la tarea "${ordenActual}": ${err.message}. El proceso automático se detuvo.`);
        setProcesando(false);
        setMensajeEstado("");
        setColaTareas(colaTareas.slice(i)); 
        return; 
      }
    }

    setMensajeEstado("✅ ¡Todas las tareas de la cola fueron procesadas con éxito!");
    setColaTareas([]); 
    setProcesando(false);
    setTimeout(() => setMensajeEstado(""), 5000);
  };

  // 5. Exportador a Word (Intacto, con el filtro mágico)
  const exportarTodoAWord = () => {
    if (borradorAcumulado.length === 0) return;

    let contenidoHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Transcripciones</title></head>
      <body style="font-family: 'Arial', sans-serif; font-size: 11pt;">
        <h2 style="text-align: center; color: #000000;">Documento de Transcripciones (OCR)</h2>
        <br>
    `;

    borradorAcumulado.forEach((item, index) => {
      let textoLimpio = item.texto
        .replace(/\n{2,}/g, '</p><p style="text-align: justify; margin-bottom: 12px; line-height: 1.5;">')
        .replace(/\n/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      contenidoHtml += `
        <h4 style="color: #333333; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Fragmento ${index + 1} (${item.orden}):</h4>
        <p style="text-align: justify; margin-bottom: 12px; line-height: 1.5;">
          ${textoLimpio}
        </p>
        <br>
      `;
    });

    contenidoHtml += `</body></html>`;

    const blob = new Blob(['\ufeff', contenidoHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Transcripciones_Fiscales_${new Date().getTime()}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const limpiarBorrador = () => {
    if (window.confirm("¿Estás seguro de borrar todo el trabajo acumulado?")) {
      setBorradorAcumulado([]);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif', backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
      <h2 style={{ color: '#2c3e50', borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>
        ⚙️ Extractor OCR (Modo Automático)
      </h2>

      {/* 1. ZONA DE SUBIDA */}
      <div style={{ border: '2px dashed #bdc3c7', padding: '15px', textAlign: 'center', borderRadius: '8px', backgroundColor: '#f8f9fa', marginBottom: '20px' }}>
        <input 
          type="file" 
          accept=".pdf, image/*" 
          onChange={(e) => setArchivo(e.target.files[0])} 
          disabled={procesando}
        />
      </div>

      {/* ============================================================== */}
      {/* 2. NUEVO: GENERADOR AUTOMÁTICO EN ACORDEÓN */}
      {/* ============================================================== */}
      <details style={{ marginBottom: '20px', backgroundColor: '#e8f4f8', borderRadius: '8px', padding: '10px', border: '1px solid #bde0eb' }}>
        <summary style={{ fontWeight: 'bold', color: '#2980b9', cursor: 'pointer', outline: 'none', padding: '5px' }}>
          🚀 Creador Rápido de Instrucciones (División Automática)
        </summary>
        <form onSubmit={generarLotesAutomaticos} style={{ display: 'flex', gap: '15px', marginTop: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          
          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' }}>Total de páginas del PDF:</label>
            <input 
              type="number" 
              value={totalPaginas} 
              onChange={(e) => setTotalPaginas(e.target.value)} 
              placeholder="Ej: 100"
              style={{ width: '90%', padding: '8px', borderRadius: '5px', border: '1px solid #ccc' }}
              disabled={procesando}
            />
          </div>

          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' }}>¿En cuántas partes dividir?</label>
            <select 
              value={divisiones} 
              onChange={(e) => setDivisiones(e.target.value)}
              style={{ width: '95%', padding: '8px', borderRadius: '5px', border: '1px solid #ccc', backgroundColor: 'white' }}
              disabled={procesando}
            >
              {/* Opciones de acordeón a partir de 5 hasta 30 */}
              {[5, 10, 11, 12, 13, 14, 15, 20, 25, 30].map(num => (
                <option key={num} value={num}>{num} partes</option>
              ))}
            </select>
          </div>

          <button 
            type="submit" 
            disabled={procesando || !totalPaginas}
            style={{ padding: '9px 15px', backgroundColor: '#2980b9', color: 'white', border: 'none', borderRadius: '5px', cursor: (procesando || !totalPaginas) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
          >
            Generar Lista
          </button>
        </form>
        <p style={{ fontSize: '12px', color: '#7f8c8d', marginTop: '10px', fontStyle: 'italic' }}>
          Ejemplo: Si pones 100 páginas y 10 partes, se crearán 10 instrucciones de 10 páginas cada una automáticamente.
        </p>
      </details>
      {/* ============================================================== */}

      {/* 3. ZONA DE INSTRUCCIÓN MANUAL (Por si quiere algo muy específico) */}
      <form onSubmit={agregarALaCola} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input 
          type="text" 
          value={instruccionActual} 
          onChange={(e) => setInstruccionActual(e.target.value)} 
          placeholder='Añadir manual. Ej: Transcribe folio 45'
          style={{ flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '15px' }}
          disabled={procesando}
        />
        <button 
          type="submit" 
          disabled={procesando || !instruccionActual.trim()}
          style={{ padding: '10px 15px', backgroundColor: '#34495e', color: 'white', border: 'none', borderRadius: '5px', cursor: (procesando || !instruccionActual) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
        >
          ➕ Añadir Manual
        </button>
      </form>

      {/* 4. VISOR DE LA COLA */}
      {colaTareas.length > 0 && (
        <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #ffc107', marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#856404' }}>📋 Tareas en Cola por Ejecutar ({colaTareas.length}):</h4>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#856404', fontSize: '14px' }}>
            {colaTareas.map((tarea, index) => (
              <li key={index} style={{ marginBottom: '5px', display: 'flex', justifyContent: 'space-between' }}>
                <span>{index + 1}. {tarea}</span>
                {!procesando && (
                  <button onClick={() => quitarDeLaCola(index)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>✖ Quitar</button>
                )}
              </li>
            ))}
          </ul>
          
          <button 
            onClick={ejecutarColaAutomatica}
            disabled={procesando}
            style={{ marginTop: '15px', width: '100%', padding: '12px', backgroundColor: procesando ? '#95a5a6' : '#2980b9', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', fontSize: '16px', cursor: procesando ? 'wait' : 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
          >
            {procesando ? "⚙️ Ejecutando Cola..." : "▶️ Iniciar Procesamiento Automático"}
          </button>
        </div>
      )}

      {/* MENSAJES DE ESTADO */}
      {mensajeEstado && (
        <div style={{ textAlign: 'center', margin: '15px 0', padding: '10px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '5px', fontWeight: 'bold' }}>
          {mensajeEstado}
        </div>
      )}
      {error && <div style={{ color: '#e74c3c', backgroundColor: '#fadbd8', padding: '10px', borderRadius: '5px', fontWeight: 'bold', marginBottom: '15px' }}>{error}</div>}

      {/* 5. ZONA DE RESULTADOS (Intacto) */}
      {borradorAcumulado.length > 0 && (
        <div style={{ marginTop: '30px', borderTop: '2px dashed #bdc3c7', paddingTop: '20px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, color: '#27ae60' }}>
              📚 Fragmentos Listos: {borradorAcumulado.length}
            </h3>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={limpiarBorrador}
                disabled={procesando}
                style={{ padding: '10px 15px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '5px', cursor: procesando ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: procesando ? 0.5 : 1 }}
              >
                🗑️ Limpiar TODO
              </button>
              
              <button 
                onClick={exportarTodoAWord}
                disabled={procesando}
                style={{ padding: '10px 15px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '5px', cursor: procesando ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: procesando ? 0.5 : 1 }}
              >
                💾 Exportar a Word
              </button>
            </div>
          </div>
          
          <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}>
            {borradorAcumulado.map((item, index) => (
              <div key={index} style={{ marginBottom: '20px', backgroundColor: '#f1f5f9', padding: '15px', borderRadius: '8px', borderLeft: '5px solid #3498db' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#34495e' }}>Extraído: <span style={{color: '#7f8c8d'}}>{item.orden}</span></h4>
                <div style={{ fontFamily: 'monospace', fontSize: '14px', whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto', backgroundColor: 'white', padding: '10px', border: '1px solid #e2e8f0' }}>
                  {item.texto}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExtractorOCR;