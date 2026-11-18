import { describe, expect, it } from 'vitest';
import { buildActividadMail, getActividadPrimerNombre, type ActividadExterna } from './actividadExterna';

const record: ActividadExterna = {
  id: 'sol-1', empleado: '1008', nombre: 'García López, María Isabel',
  email: 'example@example.test', actividad: 'Actividad de formación',
  fechaSolicitud: '2026-11-18', remunerada: false, estado: 'autorizada',
  motivoDenegacion: '', observacionesResolucion: '', fechaResolucion: '2026-11-18',
  comunicacion: 'pendiente', fechaComunicacion: null,
  createdAt: '2026-11-18', updatedAt: '2026-11-18',
};

describe('Actividades externas · comunicación favorable de Comité de Dirección', () => {
  it('extrae el nombre de pila de registros Apellidos, Nombre', () => {
    expect(getActividadPrimerNombre('García López, María Isabel')).toBe('María');
    expect(getActividadPrimerNombre('Pérez, Iñaki')).toBe('Iñaki');
    expect(getActividadPrimerNombre('Ana García')).toBe('Ana');
  });

  it('mantiene el texto aprobado y usa el puesto facilitado por Plantilla', () => {
    const mail = buildActividadMail(record, 'Responsable de Seguridad');
    expect(mail.subject).toBe('Resolución favorable de solicitud de actividad externa');
    expect(mail.html).toContain('Kaixo María,');
    expect(mail.html).toContain('Atendiendo a las explicaciones de las actividades concretas que nos ha hecho llegar, te comunicamos que una vez revisada tu solicitud no existe incompatibilidad con tu puesto de Responsable de Seguridad.');
    expect(mail.html).toContain('Cualquier aclaración estamos a tu disposición.');
    expect(mail.html).toContain('Ondo izan');
    expect(mail.html).not.toContain('García López');
    expect(mail.html).not.toContain('Actividad de formación');
  });

  it('escapa datos externos y señala un puesto ausente sin inventarlo', () => {
    const mail = buildActividadMail({ ...record, nombre: 'Pérez, Ana <test>' }, '');
    expect(mail.html).toContain('Kaixo Ana,');
    expect(mail.html).toContain('[PUESTO DE TRABAJO]');
    expect(mail.html).not.toContain('<test>');
  });
});
