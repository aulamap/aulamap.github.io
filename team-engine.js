// Motor de equipos de GeCo (https://github.com/jjdeharo/geco), copiado tal cual
// de su team-engine.js (versión 2.6.0) para que los equipos salgan idénticos.
// No se toca aquí: si cambia en GeCo, se vuelve a copiar.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GecoTeamEngine = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function shuffleArray(array, randomFn) {
    const random = typeof randomFn === 'function' ? randomFn : Math.random;
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function etiquetarAlumnos(lista, tipo) {
    return lista.map(nombre => ({ nombre, tipo }));
  }

  function calcularCapacidades(totalStudents, membersPerGroup, leftoversOption) {
    if (!membersPerGroup || membersPerGroup <= 0 || totalStudents <= 0) {
      return [];
    }
    const baseGroups = Math.floor(totalStudents / membersPerGroup);
    const remainder = totalStudents % membersPerGroup;
    if (baseGroups === 0) {
      return [totalStudents];
    }
    const capacidades = Array.from({ length: baseGroups }, () => membersPerGroup);
    if (remainder === 0) {
      return capacidades;
    }
    if (leftoversOption === 'grupoNuevo') {
      if (remainder >= 2) {
        capacidades.push(remainder);
      } else if (membersPerGroup >= 3) {
        // Un único sobrante no forma equipo: se completa con una persona de otro equipo.
        capacidades[baseGroups - 1] = membersPerGroup - 1;
        capacidades.push(2);
      } else {
        // Con equipos de 2 no se puede ceder a nadie sin dejar otro equipo unitario.
        capacidades[baseGroups - 1] += 1;
      }
      return capacidades;
    }
    for (let i = 0; i < remainder; i++) {
      capacidades[i % baseGroups] += 1;
    }
    return capacidades;
  }

  function calculateMaxGroups(totalStudents, membersPerGroup, leftoversOption) {
    return calcularCapacidades(totalStudents, membersPerGroup, leftoversOption).length;
  }

  function countStudentsByType(grupo) {
    return grupo.reduce((acc, alumno) => {
      acc[alumno.tipo] = (acc[alumno.tipo] || 0) + 1;
      return acc;
    }, { A: 0, B: 0, C: 0 });
  }

  function construirMapaIncompatibles(incompatSets) {
    const mapa = new Map();
    incompatSets.forEach(set => {
      set.forEach(alumno => {
        if (!mapa.has(alumno.nombre)) {
          mapa.set(alumno.nombre, new Set());
        }
        set.forEach(otro => {
          if (otro.nombre !== alumno.nombre) {
            mapa.get(alumno.nombre).add(otro.nombre);
          }
        });
      });
    });
    return mapa;
  }

  function tieneConflicto(grupo, alumno, mapaIncompatibles) {
    const incompatibles = mapaIncompatibles.get(alumno.nombre);
    return Boolean(incompatibles) && grupo.some(miembro => incompatibles.has(miembro.nombre));
  }

  function getAvailableGroups(grupos, capacidades) {
    return grupos.filter((grupo, indice) => grupo.length < capacidades[indice]);
  }

  function getMinimumTypeCount(grupos, capacidades, tipo) {
    const availableGroups = getAvailableGroups(grupos, capacidades);
    if (availableGroups.length === 0) {
      return 0;
    }
    return Math.min(...availableGroups.map(grupo => countStudentsByType(grupo)[tipo]));
  }

  function getMinimumSupportCount(grupos, capacidades) {
    const availableGroups = getAvailableGroups(grupos, capacidades);
    if (availableGroups.length === 0) {
      return 0;
    }
    return Math.min(...availableGroups.map(grupo => {
      const counts = countStudentsByType(grupo);
      return counts.A + counts.C;
    }));
  }

  function puntuarGrupoParaIncompatible(grupo, capacidad, alumno, grupos, capacidades, mode) {
    if (grupo.length >= capacidad) {
      // Solo se usa si no queda hueco en ningún equipo compatible.
      return -1000000 - grupo.length;
    }
    let score = (capacidad - grupo.length) * 25;
    if (mode === 'heterogeneos') {
      const counts = countStudentsByType(grupo);
      const minTipo = getMinimumTypeCount(grupos, capacidades, alumno.tipo);
      const minApoyo = getMinimumSupportCount(grupos, capacidades);
      score -= counts[alumno.tipo] * 20;
      if (counts[alumno.tipo] === minTipo) {
        score += 80;
      }
      if ((alumno.tipo === 'A' || alumno.tipo === 'C') && (counts.A + counts.C) === minApoyo) {
        score += 90;
      }
    }
    return score;
  }

  function preAsignarIncompatibles(grupos, capacidades, incompatSets, mapaIncompatibles, mode) {
    const orderedSets = [...incompatSets].sort((a, b) => {
      if (b.length !== a.length) {
        return b.length - a.length;
      }
      const apoyoA = a.filter(alumno => alumno.tipo === 'A' || alumno.tipo === 'C').length;
      const apoyoB = b.filter(alumno => alumno.tipo === 'A' || alumno.tipo === 'C').length;
      return apoyoB - apoyoA;
    });
    orderedSets.forEach(set => {
      set.forEach(alumno => {
        let mejorIndice = -1;
        let mejorPuntuacion = Number.NEGATIVE_INFINITY;
        for (let i = 0; i < grupos.length; i++) {
          if (tieneConflicto(grupos[i], alumno, mapaIncompatibles)) continue;
          const puntuacion = puntuarGrupoParaIncompatible(grupos[i], capacidades[i], alumno, grupos, capacidades, mode);
          if (puntuacion > mejorPuntuacion) {
            mejorPuntuacion = puntuacion;
            mejorIndice = i;
          }
        }
        if (mejorIndice === -1) {
          grupos.push([alumno]);
          capacidades.push(1);
        } else {
          grupos[mejorIndice].push(alumno);
        }
      });
    });
  }

  function distribuirAlumnosPorGrupo(alumnos, grupos, capacidades, sobrantes) {
    let indicePreferente = 0;
    alumnos.forEach(alumno => {
      let colocado = false;
      for (let i = 0; i < grupos.length; i++) {
        const indice = (indicePreferente + i) % grupos.length;
        if (grupos[indice].length < capacidades[indice]) {
          grupos[indice].push(alumno);
          indicePreferente = indice + 1;
          colocado = true;
          break;
        }
      }
      if (!colocado) {
        sobrantes.push(alumno);
      }
    });
  }

  function puntuarGrupoHeterogeneoParaAlumno(grupo, capacidad, alumno, grupos, capacidades) {
    if (grupo.length >= capacidad) {
      return Number.NEGATIVE_INFINITY;
    }
    const counts = countStudentsByType(grupo);
    const minTipo = getMinimumTypeCount(grupos, capacidades, alumno.tipo);
    const minApoyo = getMinimumSupportCount(grupos, capacidades);
    let score = (capacidad - grupo.length) * 30;
    score -= counts[alumno.tipo] * 20;
    if (counts[alumno.tipo] === minTipo) {
      score += 110;
    } else {
      score -= (counts[alumno.tipo] - minTipo) * 35;
    }

    if (alumno.tipo === 'A' || alumno.tipo === 'C') {
      const totalApoyo = counts.A + counts.C;
      if (totalApoyo === minApoyo) {
        score += 120;
      }
      if (totalApoyo === 0) {
        score += 220;
      } else if (counts[alumno.tipo] === 0) {
        score += 110;
      } else {
        score -= totalApoyo * 35;
      }
      if (counts[alumno.tipo] === 0) {
        score += 40;
      }
      if (counts.B > 0) {
        score += 15;
      }
    } else {
      if (counts.A > 0) {
        score += 35;
      } else {
        score -= 30;
      }
      if (counts.C > 0) {
        score += 35;
      } else {
        score -= 30;
      }
      if (counts.B === 0) {
        score += 10;
      }
    }

    return score;
  }

  function asignarAlumnosHeterogeneos(alumnos, grupos, capacidades, sobrantes) {
    alumnos.forEach(alumno => {
      let mejorIndice = -1;
      let mejorPuntuacion = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < grupos.length; i++) {
        const puntuacion = puntuarGrupoHeterogeneoParaAlumno(grupos[i], capacidades[i], alumno, grupos, capacidades);
        if (puntuacion > mejorPuntuacion) {
          mejorPuntuacion = puntuacion;
          mejorIndice = i;
        }
      }
      if (mejorIndice === -1) {
        sobrantes.push(alumno);
        return;
      }
      grupos[mejorIndice].push(alumno);
    });
  }

  function evaluarGrupoHeterogeneo(grupo) {
    const counts = countStudentsByType(grupo);
    let penalty = 0;

    if (grupo.length === 0) {
      return 100;
    }
    if (counts.A === 0) {
      penalty += 12;
    }
    if (counts.C === 0) {
      penalty += 12;
    }
    if (grupo.length >= 3 && counts.B === 0) {
      penalty += 6;
    }
    if (counts.A > 1) {
      penalty += (counts.A - 1) * 3;
    }
    if (counts.C > 1) {
      penalty += (counts.C - 1) * 3;
    }
    if (counts.B > Math.max(1, grupo.length - 2)) {
      penalty += counts.B - Math.max(1, grupo.length - 2);
    }

    return penalty;
  }

  function intercambioSeguro(grupoX, indiceX, grupoY, indiceY, mapaIncompatibles) {
    // El intercambio es válido si ninguno de los dos acaba con una persona incompatible.
    const alumnoX = grupoX[indiceX];
    const alumnoY = grupoY[indiceY];
    const restoX = grupoX.filter((_, i) => i !== indiceX);
    const restoY = grupoY.filter((_, i) => i !== indiceY);
    return !tieneConflicto(restoX, alumnoY, mapaIncompatibles) && !tieneConflicto(restoY, alumnoX, mapaIncompatibles);
  }

  function optimizarGruposHeterogeneos(grupos, mapaIncompatibles) {
    // Intercambios de dos en dos mientras mejoren el conjunto; los tamaños no cambian.
    for (let pass = 0; pass < 200; pass++) {
      let improved = false;
      for (let i = 0; i < grupos.length && !improved; i++) {
        for (let j = i + 1; j < grupos.length && !improved; j++) {
          const grupoA = grupos[i];
          const grupoB = grupos[j];
          const basePenalty = evaluarGrupoHeterogeneo(grupoA) + evaluarGrupoHeterogeneo(grupoB);

          for (let a = 0; a < grupoA.length && !improved; a++) {
            for (let b = 0; b < grupoB.length; b++) {
              const alumnoA = grupoA[a];
              const alumnoB = grupoB[b];
              if (alumnoA.tipo === alumnoB.tipo) continue;
              if (!intercambioSeguro(grupoA, a, grupoB, b, mapaIncompatibles)) continue;

              grupoA[a] = alumnoB;
              grupoB[b] = alumnoA;

              const newPenalty = evaluarGrupoHeterogeneo(grupoA) + evaluarGrupoHeterogeneo(grupoB);
              if (newPenalty < basePenalty) {
                improved = true;
                break;
              }

              grupoA[a] = alumnoA;
              grupoB[b] = alumnoB;
            }
          }
        }
      }
      if (!improved) {
        break;
      }
    }
  }

  function balancearGruposHeterogeneos(grupos, mapaIncompatibles) {
    grupos.forEach((grupo, indiceGrupo) => {
      const tieneA = grupo.some(alumno => alumno.tipo === 'A');
      const tieneC = grupo.some(alumno => alumno.tipo === 'C');
      if (tieneA || tieneC) return;
      for (let j = 0; j < grupos.length; j++) {
        if (j === indiceGrupo) continue;
        const grupoDonante = grupos[j];
        const counts = countStudentsByType(grupoDonante);
        // El equipo donante no puede quedarse sin A ni C.
        if (counts.A + counts.C < 2) continue;
        for (let indiceApoyo = 0; indiceApoyo < grupoDonante.length; indiceApoyo++) {
          const apoyo = grupoDonante[indiceApoyo];
          if (apoyo.tipo !== 'A' && apoyo.tipo !== 'C') continue;
          for (let indiceB = 0; indiceB < grupo.length; indiceB++) {
            if (grupo[indiceB].tipo !== 'B') continue;
            if (!intercambioSeguro(grupo, indiceB, grupoDonante, indiceApoyo, mapaIncompatibles)) continue;
            grupoDonante[indiceApoyo] = grupo[indiceB];
            grupo[indiceB] = apoyo;
            return;
          }
        }
      }
    });
  }

  function colocarSobrantes(grupos, sobrantes, mapaIncompatibles) {
    sobrantes.forEach(alumno => {
      const candidatos = grupos.filter(grupo => !tieneConflicto(grupo, alumno, mapaIncompatibles));
      if (candidatos.length === 0) {
        grupos.push([alumno]);
        return;
      }
      candidatos.sort((x, y) => x.length - y.length)[0].push(alumno);
    });
  }

  function tipoPredominante(grupo) {
    const contador = grupo.reduce((acc, alumno) => {
      acc[alumno.tipo] = (acc[alumno.tipo] || 0) + 1;
      return acc;
    }, {});
    let mejorTipo = null;
    let mejorConteo = -1;
    Object.entries(contador).forEach(([tipo, conteo]) => {
      if (conteo > mejorConteo) {
        mejorTipo = tipo;
        mejorConteo = conteo;
      }
    });
    return mejorTipo;
  }

  const PREFERENCIAS_SUELTOS = {
    A: ['B', 'A', 'C'],
    B: ['A', 'C', 'B'],
    C: ['B', 'C', 'A']
  };

  function colocarSueltoHomogeneo(grupos, alumno, mapaIncompatibles) {
    const candidatos = grupos.filter(grupo => grupo.length > 0 && !tieneConflicto(grupo, alumno, mapaIncompatibles));
    if (candidatos.length === 0) {
      return false;
    }
    const preferencias = PREFERENCIAS_SUELTOS[alumno.tipo];
    const rango = grupo => {
      const indice = preferencias.indexOf(tipoPredominante(grupo));
      return indice === -1 ? preferencias.length : indice;
    };
    candidatos.sort((x, y) => rango(x) - rango(y) || x.length - y.length)[0].push(alumno);
    return true;
  }

  function cederCompanero(grupos, grupoUnitario, mapaIncompatibles) {
    // Si nadie puede acoger a la persona sola, otro equipo le cede a alguien compatible.
    const [alumno] = grupoUnitario;
    const donantes = grupos
      .filter(grupo => grupo !== grupoUnitario && grupo.length >= 3)
      .sort((x, y) => y.length - x.length);
    for (const donante of donantes) {
      const opciones = donante
        .map((miembro, indice) => ({ miembro, indice }))
        .filter(({ miembro }) => !mapaIncompatibles.has(miembro.nombre) || !tieneConflicto([alumno], miembro, mapaIncompatibles))
        .sort((x, y) => (y.miembro.tipo === alumno.tipo) - (x.miembro.tipo === alumno.tipo));
      if (opciones.length > 0) {
        grupoUnitario.push(donante.splice(opciones[0].indice, 1)[0]);
        return true;
      }
    }
    return false;
  }

  function fusionarGruposUnitarios(grupos, mapaIncompatibles) {
    for (let i = grupos.length - 1; i >= 0; i--) {
      if (grupos[i].length !== 1 || grupos.length === 1) continue;
      const [grupo] = grupos.splice(i, 1);
      if (!colocarSueltoHomogeneo(grupos, grupo[0], mapaIncompatibles)) {
        cederCompanero(grupos, grupo, mapaIncompatibles);
        grupos.splice(i, 0, grupo);
      }
    }
  }

  function generarGruposHeterogeneos(listaA, listaB, listaC, numAlumnos, incompatSets, mapaIncompatibles, opcionSobrantes, totalAlumnosOriginal) {
    const capacidades = calcularCapacidades(totalAlumnosOriginal, numAlumnos, opcionSobrantes);
    const grupos = capacidades.map(() => []);
    const sobrantes = [];
    preAsignarIncompatibles(grupos, capacidades, incompatSets, mapaIncompatibles, 'heterogeneos');
    asignarAlumnosHeterogeneos(listaA, grupos, capacidades, sobrantes);
    asignarAlumnosHeterogeneos(listaC, grupos, capacidades, sobrantes);
    asignarAlumnosHeterogeneos(listaB, grupos, capacidades, sobrantes);
    balancearGruposHeterogeneos(grupos, mapaIncompatibles);
    optimizarGruposHeterogeneos(grupos, mapaIncompatibles);
    colocarSobrantes(grupos, sobrantes, mapaIncompatibles);
    return grupos.filter(grupo => grupo.length > 0);
  }

  function dividirGruposGrandes(grupos, numAlumnos) {
    // Un equipo que acoge a personas sueltas puede pasarse de tamaño; se parte en dos
    // dejando junto al mayor número posible de personas de la tipología predominante.
    // Los miembros ya son compatibles entre sí, así que cualquier partición es válida.
    for (let i = 0; i < grupos.length; i++) {
      const grupo = grupos[i];
      if (grupo.length <= numAlumnos + 1) continue;
      const predominante = tipoPredominante(grupo);
      const ordenados = [
        ...grupo.filter(alumno => alumno.tipo === predominante),
        ...grupo.filter(alumno => alumno.tipo !== predominante)
      ];
      const primero = Math.min(numAlumnos, ordenados.length - 2);
      grupos[i] = ordenados.slice(0, primero);
      grupos.splice(i + 1, 0, ordenados.slice(primero));
    }
  }

  function generarGruposHomogeneos(listas, numAlumnos, incompatSets, mapaIncompatibles, opcionSobrantes) {
    const grupos = [];
    const sueltos = [];
    const incompatibles = [...incompatSets].sort((a, b) => b.length - a.length).flat();

    ['A', 'B', 'C'].forEach(tipo => {
      const incompatiblesDelTipo = incompatibles.filter(alumno => alumno.tipo === tipo);
      const resto = listas[tipo];
      const total = incompatiblesDelTipo.length + resto.length;
      if (total === 0) return;
      if (total === 1) {
        sueltos.push(...incompatiblesDelTipo, ...resto);
        return;
      }
      // Si sobran más personas que equipos hay de la tipología, forman su propio equipo.
      const demasiadosSobrantes = total % numAlumnos > Math.floor(total / numAlumnos);
      const opcionTipo = opcionSobrantes === 'agregar' && demasiadosSobrantes ? 'grupoNuevo' : opcionSobrantes;
      const capacidades = calcularCapacidades(total, numAlumnos, opcionTipo);
      const equipos = capacidades.map(() => []);
      incompatiblesDelTipo.forEach(alumno => {
        let mejorIndice = -1;
        equipos.forEach((equipo, i) => {
          if (equipo.length >= capacidades[i] || tieneConflicto(equipo, alumno, mapaIncompatibles)) return;
          if (mejorIndice === -1 || capacidades[i] - equipo.length > capacidades[mejorIndice] - equipos[mejorIndice].length) {
            mejorIndice = i;
          }
        });
        if (mejorIndice === -1) {
          // No cabe en ningún equipo de su tipología sin coincidir con alguien incompatible.
          sueltos.push(alumno);
        } else {
          equipos[mejorIndice].push(alumno);
        }
      });
      resto.forEach(alumno => {
        const indice = equipos.findIndex((equipo, i) => equipo.length < capacidades[i]);
        if (indice === -1) {
          sueltos.push(alumno);
        } else {
          equipos[indice].push(alumno);
        }
      });
      grupos.push(...equipos.filter(equipo => equipo.length > 0));
    });

    if (opcionSobrantes === 'grupoNuevo' && sueltos.length >= 2) {
      const nuevos = [];
      sueltos.forEach(alumno => {
        const destino = nuevos.find(grupo => grupo.length < numAlumnos && !tieneConflicto(grupo, alumno, mapaIncompatibles));
        if (destino) {
          destino.push(alumno);
        } else {
          nuevos.push([alumno]);
        }
      });
      grupos.push(...nuevos);
    } else {
      sueltos.forEach(alumno => {
        if (!colocarSueltoHomogeneo(grupos, alumno, mapaIncompatibles)) {
          grupos.push([alumno]);
        }
      });
    }

    fusionarGruposUnitarios(grupos, mapaIncompatibles);
    dividirGruposGrandes(grupos, numAlumnos);
    return grupos;
  }

  function generarGruposEsporadicos(listaRestante, numAlumnos, incompatSets, mapaIncompatibles, opcionSobrantes, totalAlumnosOriginal, randomFn) {
    const capacidades = calcularCapacidades(totalAlumnosOriginal, numAlumnos, opcionSobrantes);
    const grupos = capacidades.map(() => []);
    const sobrantes = [];
    preAsignarIncompatibles(grupos, capacidades, incompatSets, mapaIncompatibles, 'default');
    const mezcla = shuffleArray([...listaRestante], randomFn);
    distribuirAlumnosPorGrupo(mezcla, grupos, capacidades, sobrantes);
    colocarSobrantes(grupos, sobrantes, mapaIncompatibles);
    return grupos.filter(grupo => grupo.length > 0);
  }

  function buildInputMap(listaAlumnosA, listaAlumnosB, listaAlumnosC) {
    return new Map([
      ...listaAlumnosA.map(alumno => [alumno.nombre, alumno]),
      ...listaAlumnosB.map(alumno => [alumno.nombre, alumno]),
      ...listaAlumnosC.map(alumno => [alumno.nombre, alumno])
    ]);
  }

  function buildIncompatibilitySets(incompatibleGroups, mapaAlumnos) {
    return incompatibleGroups
      .map(grupo => grupo.map(nombre => mapaAlumnos.get(nombre)).filter(Boolean))
      .filter(grupo => grupo.length >= 2);
  }

  function generateTeams(options) {
    const {
      grupoA = [],
      grupoB = [],
      grupoC = [],
      numAlumnos,
      tipoGrupo,
      opcionSobrantes,
      incompatibleGroups = [],
      random
    } = options || {};

    let listaAlumnosA = shuffleArray(etiquetarAlumnos(grupoA, 'A'), random);
    let listaAlumnosB = shuffleArray(etiquetarAlumnos(grupoB, 'B'), random);
    let listaAlumnosC = shuffleArray(etiquetarAlumnos(grupoC, 'C'), random);

    const mapaAlumnos = buildInputMap(listaAlumnosA, listaAlumnosB, listaAlumnosC);
    const incompatSets = buildIncompatibilitySets(incompatibleGroups, mapaAlumnos);
    const nombresIncompatibles = new Set(incompatSets.flat().map(alumno => alumno.nombre));

    listaAlumnosA = listaAlumnosA.filter(alumno => !nombresIncompatibles.has(alumno.nombre));
    listaAlumnosB = listaAlumnosB.filter(alumno => !nombresIncompatibles.has(alumno.nombre));
    listaAlumnosC = listaAlumnosC.filter(alumno => !nombresIncompatibles.has(alumno.nombre));

    const totalOriginal = grupoA.length + grupoB.length + grupoC.length;
    const mapaIncompatibles = construirMapaIncompatibles(incompatSets);
    let teams;

    if (tipoGrupo === 'heterogeneos') {
      teams = generarGruposHeterogeneos(listaAlumnosA, listaAlumnosB, listaAlumnosC, numAlumnos, incompatSets, mapaIncompatibles, opcionSobrantes, totalOriginal);
    } else if (tipoGrupo === 'homogeneos') {
      const listas = { A: listaAlumnosA, B: listaAlumnosB, C: listaAlumnosC };
      teams = generarGruposHomogeneos(listas, numAlumnos, incompatSets, mapaIncompatibles, opcionSobrantes);
    } else {
      const combinados = [...listaAlumnosA, ...listaAlumnosB, ...listaAlumnosC];
      teams = generarGruposEsporadicos(combinados, numAlumnos, incompatSets, mapaIncompatibles, opcionSobrantes, totalOriginal, random);
    }

    return { teams, incompatSets };
  }

  return {
    calculateMaxGroups,
    countStudentsByType,
    generateTeams,
    shuffleArray
  };
}));
