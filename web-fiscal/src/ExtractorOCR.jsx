import React, { useState } from 'react';
import html2pdf from 'html2pdf.js'; // El nuevo motor de PDF

const ExtractorOCR = () => {
  // 1. Estados para MÚLTIPLES archivos
  const [archivos, setArchivos] = useState([]);
  const [archivoActivo, setArchivoActivo] = useState(null); // El tomo que estamos configurando
  
  // 2. La Súper Cola (ahora guarda el Archivo + La Instrucción)
  const [instruccionActual, setInstruccionActual] = useState("");
  const [colaTareas, setColaTareas] = useState([]);
  const [borradorAcumulado, setBorradorAcumulado] = useState([]);
  
  const [totalPaginas, setTotalPaginas] = useState("");
  const [divisiones, setDivisiones] = useState("10");

  const [procesando, setProcesando] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState("");
  const [error, setError] = useState("");
  const [procesandoCola, setProcesandoCola] = useState(false);
  const [tareaActual, setTareaActual] = useState(null);

  const BACKEND_URL = "https://api-fiscal-backend.onrender.com/api/transcribir-fojas";

  // Capturar múltiples archivos
  const manejarSubida = (e) => {
    const files = Array.from(e.target.files);
    setArchivos(files);
    if (files.length > 0) {
      setArchivoActivo(files[0]); // Seleccionamos el primero por defecto
    }
  };

  // Agregar tarea manual a la Súper Cola
  const agregarALaCola = (e) => {
    e.preventDefault();
    if (!archivoActivo) return alert("Selecciona un tomo primero.");
    if (!instruccionActual.trim()) return;
    
    setColaTareas([...colaTareas, { archivo: archivoActivo, instruccion: instruccionActual }]);
    setInstruccionActual(""); 
  };

  // Generador Automático (ahora amarrado al tomo seleccionado)
  const generarLotesAutomaticos = (e) => {
    e.preventDefault();
    if (!archivoActivo) return alert("Selecciona un tomo primero.");
    const total = parseInt(totalPaginas);
    const div = parseInt(divisiones);

    if (isNaN(total) || total <= 0) return alert("Ingresa un número válido para las páginas.");

    const paginasPorFragmento = Math.ceil(total / div);
    const nuevasTareas = [];

    for (let i = 0; i < div; i++) {
      const inicio = (i * paginasPorFragmento) + 1;
      const fin = Math.min((i + 1) * paginasPorFragmento, total);
      
      if (inicio <= total) {
        nuevasTareas.push({
          archivo: archivoActivo,
          instruccion: `Transcribe la página ${inicio} a ${fin}`
        });
      }
    }

    setColaTareas([...colaTareas, ...nuevasTareas]);
    setTotalPaginas(""); 
    alert(`Se agregaron ${nuevasTareas.length} tareas para el archivo: ${archivoActivo.name}`);
  };

  const quitarDeLaCola = (index) => {
    const nuevaCola = colaTareas.filter((_, i) => i !== index);
    setColaTareas(nuevaCola);
  };

  // 3. EL MOTOR DE LA SÚPER COLA
  const ejecutarColaAutomatica = async () => {
    if (colaTareas.length === 0) return;
    setProcesandoCola(true);
    setMensajeEstado(`Iniciando procesamiento automático de ${colaTareas.length} tareas...`);

    let tareasExitosas = [];
    
    for (let i = 0; i < colaTareas.length; i++) {
      const tarea = colaTareas[i];
      setTareaActual(tarea.id); // Esta variable ya la declaraste, así que funcionará perfecto

      const formData = new FormData();
      // CORRECCIÓN 1 y 2: Usamos el nombre que espera el backend ('documento') y la variable correcta ('tarea.archivo')
      formData.append('documento', tarea.archivo); 
      // CORRECCIÓN 3: Enviamos la instrucción de texto que ya generaste y que el backend espera
      formData.append('instruccion', tarea.instruccion);

      let exito = false;
      let reintentos = 0;
      const maxReintentos = 3;

      while (!exito && reintentos < maxReintentos) {
        try {
          if (reintentos === 0) {
            setMensajeEstado(`Ejecutando: "${tarea.instruccion}" del archivo ${tarea.archivo.name}...`);
          } else {
             setMensajeEstado(`Reintentando: "${tarea.instruccion}" (Intento ${reintentos + 1}/3)... esperando que Google libere cupo...`);
             await new Promise(resolve => setTimeout(resolve, 20000)); 
          }

          // CORRECCIÓN 4: Usamos tu constante BACKEND_URL que apunta a /api/transcribir-fojas
          const response = await fetch(BACKEND_URL, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            if(response.status === 429) {
                throw new Error("Límite de velocidad de Google alcanzado.");
            }
            throw new Error(`Fallo al transcribir. Código: ${response.status}`);
          }

          const data = await response.json();
          
          if (data.texto) { // Ajustado a data.texto que es lo que devuelve el backend
             const nuevoFragmento = {
               id: Date.now() + Math.random(),
               texto: data.texto,
               origen: `[${tarea.archivo.name}] ${tarea.instruccion}` // Para que el borrador salga bonito
             };
             
             // Agregamos al borrador acumulado para que el botón de PDF funcione
             setBorradorAcumulado(prev => [...prev, {
                texto: data.texto,
                archivoNombre: tarea.archivo.name,
                orden: tarea.instruccion
             }]);

             tareasExitosas.push(tarea); // Guardamos la tarea completa
             exito = true; 
          } else {
             throw new Error("Respuesta vacía del servidor.");
          }

        } catch (error) {
          console.error("Error en la tarea:", error);
          reintentos++;
          if (reintentos >= maxReintentos) {
             setMensajeEstado(`Error final en la orden: "${tarea.instruccion}". Proceso detenido.`);
             setProcesandoCola(false);
             setTareaActual(null);
             // Quitamos de la cola visual solo las tareas que fueron exitosas
             setColaTareas(prev => prev.filter(t => !tareasExitosas.includes(t)));
             return; 
          }
        }
      }

      // Freno de mano de 30 segundos entre tareas para respetar a Google
      if (exito && i < colaTareas.length - 1) {
        setMensajeEstado(`✅ Completado. Pausa de seguridad de 30s para respetar los límites de Google...`);
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }

    setMensajeEstado(`🎉 ¡Procesamiento automático finalizado con éxito!`);
    setProcesandoCola(false);
    setTareaActual(null);
    setColaTareas([]);
  };

  // 4. EL NUEVO EXPORTADOR A PDF
  // 4. EL NUEVO EXPORTADOR A PDF
  // 4. EL NUEVO EXPORTADOR A PDF (Con parche de renderizado)
  // 4. EL NUEVO EXPORTADOR A PDF (Con parche de renderizado)
  const exportarTodoAPDF = () => {
    if (borradorAcumulado.length === 0) return;
    
    // Opcional: Avisar al usuario que está cargando
    if(setMensajeEstado) setMensajeEstado("Generando PDF, por favor espera un momento...");

    let htmlContent = `
      <div style="padding: 20px; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.5; color: #000; background-color: #fff; width: 800px;">
        <h2 style="text-align: center; margin-bottom: 20px;">
          Documento de Transcripciones Oficiales (OCR)
        </h2>
        <hr style="margin-bottom: 20px;">
    `;

    borradorAcumulado.forEach((item, index) => {
      let textoLimpio = item.texto
        .replace(/\n{2,}/g, '</p><p style="text-align: justify; margin-bottom: 12px;">')
        .replace(/\n/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      htmlContent += `
        <div style="margin-bottom: 30px; page-break-inside: avoid;">
          <h4 style="color: #333; border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-bottom: 15px;">
            Extracto ${index + 1} | Documento: <i>${item.archivoNombre}</i> | Ref: <i>${item.orden}</i>
          </h4>
          <p style="text-align: justify; margin-bottom: 12px;">
            ${textoLimpio}
          </p>
        </div>
      `;
    });

    htmlContent += `</div>`;

    // 1. Creamos el contenedor
    const contenedorFisico = document.createElement('div');
    contenedorFisico.innerHTML = htmlContent;
    
    // 2. EL NUEVO TRUCO: Lo dejamos en pantalla (top 0, left 0) 
    // pero lo mandamos al fondo (z-index negativo) detrás del fondo de tu app.
    // Además le ponemos fondo blanco estricto para evitar transparencias.
    contenedorFisico.style.position = 'absolute';
    contenedorFisico.style.top = '0';
    contenedorFisico.style.left = '0';
    contenedorFisico.style.zIndex = '-9999';
    contenedorFisico.style.backgroundColor = '#ffffff';
    
    document.body.appendChild(contenedorFisico);

    const opcionesPDF = {
      margin:       15,
      filename:     `Transcripciones_Fiscalia_${new Date().getTime()}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true }, 
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // 3. LA CLAVE: Le damos al navegador 800 milisegundos para que "pinte" el texto
    setTimeout(() => {
      html2pdf().set(opcionesPDF).from(contenedorFisico).save().then(() => {
        // 4. Borramos la evidencia cuando el PDF ya se descargó
        document.body.removeChild(contenedorFisico);
        if(setMensajeEstado) setMensajeEstado("✅ PDF descargado con éxito.");
      });
    }, 800); 
  };
  const limpiarBorrador = () => {
    if (window.confirm("¿Estás seguro de borrar todo el trabajo acumulado?")) {
      setBorradorAcumulado([]);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif', backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
      <h2 style={{ color: '#2c3e50', borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>
        ⚙️ Extractor OCR (Multi-Tomo a PDF)
      </h2>

      {/* 1. ZONA DE SUBIDA (Ahora con el atributo 'multiple') */}
      <div style={{ border: '2px dashed #bdc3c7', padding: '15px', textAlign: 'center', borderRadius: '8px', backgroundColor: '#f8f9fa', marginBottom: '20px' }}>
        <input 
          type="file" 
          accept=".pdf, image/*" 
          multiple 
          onChange={manejarSubida} 
          disabled={procesando}
        />
        <p style={{ fontSize: '13px', color: '#7f8c8d', margin: '5px 0 0 0' }}>Puedes seleccionar varios tomos a la vez (manteniendo presionada la tecla Ctrl).</p>
      </div>

      {/* SELECTOR DE TOMO ACTIVO */}
      {archivos.length > 0 && (
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#e8f4f8', borderRadius: '8px', border: '1px solid #bde0eb' }}>
          <label style={{ fontWeight: 'bold', color: '#2980b9', display: 'block', marginBottom: '8px' }}>
            📁 ¿Para qué tomo quieres programar las instrucciones?
          </label>
          <select 
            onChange={(e) => setArchivoActivo(archivos[e.target.value])}
            style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '15px' }}
            disabled={procesando}
          >
            {archivos.map((file, index) => (
              <option key={index} value={index}>{file.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* 2. GENERADOR AUTOMÁTICO EN ACORDEÓN */}
      <details style={{ marginBottom: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px', padding: '10px', border: '1px solid #ddd' }}>
        <summary style={{ fontWeight: 'bold', color: '#2c3e50', cursor: 'pointer', outline: 'none', padding: '5px' }}>
          🚀 Creador Rápido de Tareas (División Automática)
        </summary>
        <form onSubmit={generarLotesAutomaticos} style={{ display: 'flex', gap: '15px', marginTop: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' }}>Total de páginas del tomo:</label>
            <input 
              type="number" 
              value={totalPaginas} 
              onChange={(e) => setTotalPaginas(e.target.value)} 
              placeholder="Ej: 100"
              style={{ width: '90%', padding: '8px', borderRadius: '5px', border: '1px solid #ccc' }}
              disabled={procesando || archivos.length === 0}
            />
          </div>
          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#34495e', marginBottom: '5px' }}>¿En cuántas partes dividir?</label>
            <select 
              value={divisiones} 
              onChange={(e) => setDivisiones(e.target.value)}
              style={{ width: '95%', padding: '8px', borderRadius: '5px', border: '1px solid #ccc' }}
              disabled={procesando || archivos.length === 0}
            >
              {[5, 10, 11, 12, 13, 14, 15, 20, 25, 30].map(num => (
                <option key={num} value={num}>{num} partes</option>
              ))}
            </select>
          </div>
          <button 
            type="submit" 
            disabled={procesando || !totalPaginas || archivos.length === 0}
            style={{ padding: '9px 15px', backgroundColor: '#2980b9', color: 'white', border: 'none', borderRadius: '5px', cursor: (procesando || !totalPaginas || archivos.length===0) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
          >
            Generar Lista
          </button>
        </form>
      </details>

      {/* 3. INSTRUCCIÓN MANUAL */}
      <form onSubmit={agregarALaCola} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input 
          type="text" 
          value={instruccionActual} 
          onChange={(e) => setInstruccionActual(e.target.value)} 
          placeholder='Añadir manual. Ej: Transcribe folio 45'
          style={{ flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '15px' }}
          disabled={procesando || archivos.length === 0}
        />
        <button 
          type="submit" 
          disabled={procesando || !instruccionActual.trim() || archivos.length === 0}
          style={{ padding: '10px 15px', backgroundColor: '#34495e', color: 'white', border: 'none', borderRadius: '5px', cursor: (procesando || !instruccionActual || archivos.length===0) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
        >
          ➕ Añadir Manual
        </button>
      </form>

      {/* 4. VISOR DE LA SÚPER COLA */}
      {colaTareas.length > 0 && (
        <div style={{ backgroundColor: '#fff3cd', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #ffc107', marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#856404' }}>📋 Tareas en Cola ({colaTareas.length}):</h4>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#856404', fontSize: '14px' }}>
            {colaTareas.map((tarea, index) => (
              <li key={index} style={{ marginBottom: '5px', display: 'flex', justifyContent: 'space-between' }}>
                <span><strong>{tarea.archivo.name}:</strong> {tarea.instruccion}</span>
                {!procesando && (
                  <button onClick={() => quitarDeLaCola(index)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>✖ Quitar</button>
                )}
              </li>
            ))}
          </ul>
          
          <button 
            onClick={ejecutarColaAutomatica}
            disabled={procesando}
            disabled={procesandoCola}
            style={{ marginTop: '15px', width: '100%', padding: '12px', backgroundColor: procesando ? '#95a5a6' : '#2980b9', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', fontSize: '16px', cursor: procesando ? 'wait' : 'pointer' }}
          >
            {procesando ? "⚙️ Ejecutando Súper Cola..." : "▶️ Iniciar Procesamiento Automático"}
          </button>
        </div>
      )}

      {/* MENSAJES DE ESTADO */}
      {mensajeEstado && <div style={{ textAlign: 'center', margin: '15px 0', padding: '10px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '5px', fontWeight: 'bold' }}>{mensajeEstado}</div>}
      {error && <div style={{ color: '#e74c3c', backgroundColor: '#fadbd8', padding: '10px', borderRadius: '5px', fontWeight: 'bold', marginBottom: '15px' }}>{error}</div>}

      {/* 5. ZONA DE RESULTADOS Y EXPORTACIÓN A PDF */}
      {borradorAcumulado.length > 0 && (
        <div style={{ marginTop: '30px', borderTop: '2px dashed #bdc3c7', paddingTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, color: '#27ae60' }}>📚 Fragmentos Listos: {borradorAcumulado.length}</h3>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={limpiarBorrador}
                disabled={procesando}
                style={{ padding: '10px 15px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '5px', cursor: procesando ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
              >
                🗑️ Limpiar TODO
              </button>
              <button 
                onClick={exportarTodoAPDF}
                disabled={procesando}
                style={{ padding: '10px 15px', backgroundColor: '#e67e22', color: 'white', border: 'none', borderRadius: '5px', cursor: procesando ? 'not-allowed' : 'pointer', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
              >
                📄 Descargar en PDF
              </button>
            </div>
          </div>
          
          <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}>
            {borradorAcumulado.map((item, index) => (
              <div key={index} style={{ marginBottom: '20px', backgroundColor: '#f1f5f9', padding: '15px', borderRadius: '8px', borderLeft: '5px solid #3498db' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#34495e', fontSize: '15px' }}>
                  [{item.archivoNombre}] <span style={{color: '#7f8c8d'}}>{item.orden}</span>
                </h4>
                <div style={{ fontFamily: 'monospace', fontSize: '13px', whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto', backgroundColor: 'white', padding: '10px', border: '1px solid #e2e8f0' }}>
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