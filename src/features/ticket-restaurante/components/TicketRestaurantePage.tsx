import { CalendarDays, Euro, Settings } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTicketRestauranteWriteActions } from '../store/useTicketRestauranteWriteActions';
import {
  buildTicketDebtRegularization,
  buildTicketManualDebt,
  buildYearCalendar,
  calculateMonthlyTicketOrder,
  calculateTicketAbsenceMonthImpact,
  calculateTicketAbsenceTicketImpact,
  calculateTicketContribution,
  EMPTY_TICKET_CALENDAR_DRAFT,
  EMPTY_TICKET_PERSON_DRAFT,
  filterTicketRestaurantAbsencesByMonth,
  getEffectiveTicketPrice,
  visibleTicketCalendars,
  type TicketCalendar,
  type TicketDebtRegularizationDraft,
  type TicketManualDebtDraft,
  type TicketCalendarDraft,
  type TicketPerson,
  type TicketPersonDraft,
  type TicketRestaurantAbsence,
  normalizeTicketEmployeeNumber,
} from '../domain/ticketRestaurante';
import {
  importTicketRestaurantAbsencesFromFile,
  saveTicketRestaurantAbsencePreviewRows,
  validateTicketRestaurantAbsencePreviewRows,
  type TicketRestaurantAbsencePreviewRow,
} from '../domain/importAbsences';
import {
  importTicketManutencionesFromFile,
  validateTicketManutencionPreviewRows,
  type TicketManutencionDraft,
  type TicketManutencionPreviewRow,
} from '../domain/importManutenciones';
import { importTicketPeopleFromFile } from '../domain/importPeople';
import { useTicketRestauranteStore } from '../store/useTicketRestauranteStore';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ActionButton } from '../../../components/ui/ActionButton';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
import { buildFilterLabel } from '../../../shared/export/filterLabel';
import {
  CalendarToolbar,
  EmptyCalendar,
  Legend,
  MonthCalendar,
  SubviewButton,
} from './TicketRestauranteCalendarPanels';
import { PeoplePanel } from './TicketRestaurantePeoplePanel';
import { TicketPriceModal, TicketRulesModal } from './TicketRestauranteConfigModals';
import { CalculationPanel } from './TicketRestauranteCalculationPanel';
import { TicketRestauranteWorkflow } from './TicketRestauranteWorkflow';
import { TicketRestauranteManualDebtPanel } from './TicketRestauranteManualDebtPanel';
import { TicketRestauranteManualPeoplePanel } from './TicketRestauranteManualPeoplePanel';
import { TICKET_RESTAURANTE_HELP_SECTIONS, MONTH_OPTIONS } from './ticketRestaurantePageConfig';
import {
  formatManutencionMonth,
  formatSaveSummary,
  normalizeTicketEmployeeSearch,
  sortByName,
  sortContributionCalculationRows,
  sortMonthlyCalculationRows,
  toAbsencePreviewRow,
  toCalendarDraft,
  toManutencionDetailAbsences,
  toPersonDraft,
} from './ticketRestaurantePageHelpers';
import {
  ABSENCE_MODEL_HEADERS,
  MANUTENCIONES_MODEL_HEADERS,
  PEOPLE_EXPORT_HEADERS,
  absenceExportColumns,
  contributionCalculationExportColumns,
  exportCsv,
  monthlyCalculationExportColumns,
  ticketPersonExportColumns,
} from './ticketRestauranteExport';
import { ManutencionesPanel } from './TicketRestauranteManutencionesPanel';
import {
  AbsencePreviewModal,
  AbsencesTable,
  type TicketAbsenceDisplayRow,
} from './TicketRestauranteAbsencesTable';

function currentYear(): number {
  return new Date().getFullYear();
}

function currentMonth(): number {
  return new Date().getMonth() + 1;
}

function addYearMonth(
  year: number,
  month: number,
  offset: number,
): { year: number; month: number } {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

type TicketRestauranteSubview =
  | 'calendarios'
  | 'personas'
  | 'computoMensual'
  | 'computoCotizacion'
  | 'ausencias'
  | 'manutenciones'
  | 'deudaManual';

export function TicketRestaurantePage({
  initialAbsenceId = null,
  navigationNonce,
}: {
  initialAbsenceId?: string | null;
  navigationNonce?: number;
}) {
  const calendars = useTicketRestauranteStore((state) => state.calendars);
  const absences = useTicketRestauranteStore((state) => state.absences);
  const people = useTicketRestauranteStore((state) => state.people);
  const config = useTicketRestauranteStore((state) => state.config);
  const manutenciones = useTicketRestauranteStore((state) => state.manutenciones);
  const loadTickets = useTicketRestauranteStore((state) => state.load);
  const {
    createCalendar,
    updateCalendar,
    toggleCalendarActive,
    removeCalendar,
    toggleDay,
    saveAbsences,
    removeAbsence,
    upsertPerson,
    removePerson,
    updateConfig,
    saveManutenciones,
    removeManutencion,
    importPeople,
  } = useTicketRestauranteWriteActions();
  const employees = useEmployeeStore((state) => state.employees);
  const loadEmployees = useEmployeeStore((state) => state.load);
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const { alert, confirm, dialogNode } = useAppDialog();
  const [activeSubview, setActiveSubview] = useState<TicketRestauranteSubview | null>(null);
  const [year, setYear] = useState(currentYear());
  const [absenceYear, setAbsenceYear] = useState(currentYear());
  const [calculationYear, setCalculationYear] = useState(currentYear());
  const [calculationMonth, setCalculationMonth] = useState(currentMonth());
  const [absenceMonth, setAbsenceMonth] = useState(currentMonth());
  const [manutencionYear, setManutencionYear] = useState(currentYear());
  const [manutencionMonth, setManutencionMonth] = useState(currentMonth());
  const [calendarDraft, setCalendarDraft] = useState<TicketCalendarDraft>(
    EMPTY_TICKET_CALENDAR_DRAFT,
  );
  const [personDraft, setPersonDraft] = useState<TicketPersonDraft>(EMPTY_TICKET_PERSON_DRAFT);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editingCalendarId, setEditingCalendarId] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<TicketRestaurantAbsencePreviewRow[]>([]);
  const [importMessage, setImportMessage] = useState('');
  const [peopleImportMessage, setPeopleImportMessage] = useState('');
  const [manutencionImportMessage, setManutencionImportMessage] = useState('');
  const [manutencionPreviewRows, setManutencionPreviewRows] = useState<
    TicketManutencionPreviewRow[]
  >([]);
  const [manualManutencionEmployee, setManualManutencionEmployee] = useState('');
  const [manualManutencionDate, setManualManutencionDate] = useState('');
  const [isManutencionMonthModalOpen, setIsManutencionMonthModalOpen] = useState(false);
  const [manutencionImputationYear, setManutencionImputationYear] = useState(currentYear());
  const [manutencionImputationMonth, setManutencionImputationMonth] = useState(currentMonth());
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isAbsenceImportHelpOpen, setIsAbsenceImportHelpOpen] = useState(false);
  const [editingAbsenceId, setEditingAbsenceId] = useState<string | null>(null);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const peopleFileInputRef = useRef<HTMLInputElement | null>(null);
  const manutencionesFileInputRef = useRef<HTMLInputElement | null>(null);
  const processedNavigationNonceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    loadTickets();
    loadEmployees();
  }, [loadEmployees, loadTickets]);

  const visibleCalendars = useMemo(
    () => sortByName(visibleTicketCalendars(calendars)),
    [calendars],
  );
  const selectedCalendar = useMemo(
    () => visibleCalendars.find((calendar) => calendar.id === selectedCalendarId) ?? null,
    [selectedCalendarId, visibleCalendars],
  );
  const yearCalendar = useMemo(
    () => (selectedCalendar ? buildYearCalendar(selectedCalendar, year) : []),
    [selectedCalendar, year],
  );
  const visiblePeople = useMemo(
    () =>
      [...people]
        .filter((person) => !person.deletedAt)
        .sort((first, second) =>
          first.nombreApellidos.localeCompare(second.nombreApellidos, 'es', {
            numeric: true,
            sensitivity: 'base',
          }),
        ),
    [people],
  );
  const visibleManutenciones = useMemo(
    () =>
      [...manutenciones]
        .filter(
          (row) =>
            !row.deletedAt &&
            row.imputacionYear === manutencionYear &&
            row.imputacionMonth === manutencionMonth,
        )
        .sort((first, second) =>
          first.fechaGasto === second.fechaGasto
            ? first.nombreApellidos.localeCompare(second.nombreApellidos, 'es', {
                numeric: true,
                sensitivity: 'base',
              })
            : second.fechaGasto.localeCompare(first.fechaGasto),
        ),
    [manutencionMonth, manutencionYear, manutenciones],
  );

  const activeTicketEmployeeNumbers = useMemo(
    () =>
      new Set(
        people
          .filter((person) => person.activo && !person.deletedAt)
          .map((person) => normalizeTicketEmployeeNumber(person.empleado)),
      ),
    [people],
  );

  const applyCalendarTicketImpactToPreviewRows = useCallback(
    (rows: readonly TicketRestaurantAbsencePreviewRow[]): TicketRestaurantAbsencePreviewRow[] =>
      rows.map((row) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(row.desde) || !/^\d{4}-\d{2}-\d{2}$/.test(row.hasta)) {
          return row;
        }

        const person = people.find(
          (item) =>
            !item.deletedAt &&
            item.activo &&
            normalizeTicketEmployeeNumber(item.empleado) ===
              normalizeTicketEmployeeNumber(row.empleado),
        );
        const calendar = person
          ? calendars.find(
              (item) => !item.deletedAt && item.activo && item.id === person.calendarId,
            )
          : undefined;

        if (!person || !calendar) {
          return row;
        }

        const impact = calculateTicketAbsenceTicketImpact(
          {
            empleado: person.empleado,
            desde: row.desde,
            hasta: row.hasta,
            motivo: row.motivo,
          },
          people,
          calendars,
          config,
        );

        return {
          ...row,
          afectaTicket: impact.afectaTicket,
        };
      }),
    [calendars, config, people],
  );
  const calculationAbsences = useMemo(
    () => [...absences, ...toManutencionDetailAbsences(manutenciones)],
    [absences, manutenciones],
  );

  const monthCalculation = useMemo(
    () =>
      calculateMonthlyTicketOrder(
        people,
        calendars,
        absences,
        config,
        calculationYear,
        calculationMonth,
        manutenciones,
      ),
    [absences, calendars, calculationMonth, calculationYear, config, manutenciones, people],
  );
  const contributionCalculation = useMemo(
    () =>
      calculateTicketContribution(
        people,
        calendars,
        absences,
        config,
        calculationYear,
        calculationMonth,
        manutenciones,
      ),
    [absences, calendars, calculationMonth, calculationYear, config, manutenciones, people],
  );

  const visibleAbsences = useMemo<TicketAbsenceDisplayRow[]>(
    () =>
      filterTicketRestaurantAbsencesByMonth(absences, absenceYear, absenceMonth)
        .map((absence) => ({
          ...absence,
          ...calculateTicketAbsenceMonthImpact(
            absence,
            people,
            visibleCalendars,
            config,
            absenceYear,
            absenceMonth,
          ),
        }))
        .filter((absence) => absence.diasTicketMes > 0),
    [absenceMonth, absenceYear, absences, config, people, visibleCalendars],
  );


  const workflowAbsenceCount = useMemo(
    () =>
      filterTicketRestaurantAbsencesByMonth(absences, calculationYear, calculationMonth).filter(
        (absence) =>
          calculateTicketAbsenceMonthImpact(
            absence,
            people,
            visibleCalendars,
            config,
            calculationYear,
            calculationMonth,
          ).diasTicketMes > 0,
      ).length,
    [absences, calculationMonth, calculationYear, config, people, visibleCalendars],
  );
  const workflowManutencionCount = useMemo(
    () =>
      manutenciones.filter(
        (row) =>
          !row.deletedAt &&
          row.imputacionYear === calculationYear &&
          row.imputacionMonth === calculationMonth,
      ).length,
    [calculationMonth, calculationYear, manutenciones],
  );
  const workflowActivePeople = useMemo(
    () => visiblePeople.filter((person) => person.activo).length,
    [visiblePeople],
  );
  const workflowInactivePeople = visiblePeople.length - workflowActivePeople;

  useEffect(() => {
    if (
      selectedCalendarId &&
      visibleCalendars.some((calendar) => calendar.id === selectedCalendarId)
    ) {
      return;
    }

    setSelectedCalendarId(visibleCalendars[0]?.id ?? '');
  }, [selectedCalendarId, visibleCalendars]);

  const resetForm = () => {
    setCalendarDraft(EMPTY_TICKET_CALENDAR_DRAFT);
    setEditingCalendarId(null);
  };

  const saveCalendar = async () => {
    if (!calendarDraft.nombre.trim()) {
      return;
    }

    if (editingCalendarId) {
      const result = await updateCalendar(editingCalendarId, calendarDraft);
      if (!result.ok) {
        await alert(result.message ?? 'No se ha podido guardar el calendario.');
        return;
      }
      setSelectedCalendarId(editingCalendarId);
    } else {
      const result = await createCalendar(calendarDraft);
      if (!result.ok) {
        await alert(result.message);
        return;
      }
      setSelectedCalendarId(result.id);
    }
    resetForm();
  };

  const editCalendar = (calendar: TicketCalendar) => {
    setCalendarDraft(toCalendarDraft(calendar));
    setEditingCalendarId(calendar.id);
    setSelectedCalendarId(calendar.id);
  };

  const handleToggleCalendarActive = (calendarId: string) => {
    void (async () => {
      const result = await toggleCalendarActive(calendarId);
      if (!result.ok) {
        await alert(result.message ?? 'No se ha podido actualizar el calendario.');
      }
    })();
  };

  const resetPersonForm = () => {
    setPersonDraft(EMPTY_TICKET_PERSON_DRAFT);
    setEditingPersonId(null);
  };

  const savePerson = async () => {
    if (!personDraft.empleado.trim() || !personDraft.nombre.trim() || !personDraft.calendarId) {
      return;
    }

    const result = await upsertPerson(personDraft);
    if (!result.ok) {
      await alert(result.message ?? 'No se ha podido guardar la persona.');
      return;
    }
    resetPersonForm();
  };

  const editPerson = (person: TicketPerson) => {
    setPersonDraft(toPersonDraft(person));
    setEditingPersonId(person.empleado);
  };

  const handleRemovePerson = (empleado: string) => {
    void (async () => {
      const result = await removePerson(empleado);
      if (!result.ok) {
        await alert(result.message ?? 'No se ha podido eliminar la persona.');
      }
    })();
  };

  const removeCalendarAndPeople = async (calendarId: string) => {
    const associatedPeople = visiblePeople.filter((person) => person.calendarId === calendarId);
    const calendarName =
      calendars.find((calendar) => calendar.id === calendarId)?.nombre ?? 'este calendario';

    if (associatedPeople.length > 0) {
      const confirmed = await confirm(
        `El calendario "${calendarName}" tiene ${associatedPeople.length} persona(s) adscrita(s). ` +
          'Si continúas, se eliminarán también esas personas de Ticket Restaurante. ¿Continuar?',
        { confirmLabel: 'Eliminar', danger: true, title: 'Eliminar calendario' },
      );

      if (!confirmed) {
        return;
      }
    } else if (
      !(await confirm(`¿Eliminar el calendario "${calendarName}"?`, {
        confirmLabel: 'Eliminar',
        danger: true,
        title: 'Eliminar calendario',
      }))
    ) {
      return;
    }

    const result = await removeCalendar(calendarId);
    if (!result.ok) {
      await alert(result.message ?? 'No se ha podido eliminar el calendario.');
    }
  };

  const handleYearChange = (value: string) => {
    const parsedYear = Number(value);
    if (Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2200) {
      setYear(parsedYear);
    }
  };

  const handleToggleDay = (calendarId: string, fecha: string) => {
    void (async () => {
      const result = await toggleDay(calendarId, fecha);
      if (!result.ok) {
        await alert(result.message ?? 'No se ha podido actualizar el día del calendario.');
      }
    })();
  };

  const handleAbsenceYearChange = (value: string) => {
    const parsedYear = Number(value);
    if (Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2200) {
      setAbsenceYear(parsedYear);
    }
  };

  const handleCalculationYearChange = (value: string) => {
    const parsedYear = Number(value);
    if (Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2200) {
      setCalculationYear(parsedYear);
    }
  };

  const handleCalculationMonthChange = (value: string) => {
    const parsedMonth = Number(value);
    if (Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12) {
      setCalculationMonth(parsedMonth);
    }
  };

  const handleAbsenceMonthChange = (value: string) => {
    const parsedMonth = Number(value);
    if (Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12) {
      setAbsenceMonth(parsedMonth);
    }
  };

  const moveCalculationMonth = (offset: number) => {
    const next = addYearMonth(calculationYear, calculationMonth, offset);
    setCalculationYear(next.year);
    setCalculationMonth(next.month);
  };

  const moveAbsenceMonth = (offset: number) => {
    const next = addYearMonth(absenceYear, absenceMonth, offset);
    setAbsenceYear(next.year);
    setAbsenceMonth(next.month);
  };

  const handleManutencionYearChange = (value: string) => {
    const parsedYear = Number(value);
    if (Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2200) {
      setManutencionYear(parsedYear);
    }
  };

  const handleManutencionMonthChange = (value: string) => {
    const parsedMonth = Number(value);
    if (Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12) {
      setManutencionMonth(parsedMonth);
    }
  };

  const moveManutencionListMonth = (offset: number) => {
    const next = addYearMonth(manutencionYear, manutencionMonth, offset);
    setManutencionYear(next.year);
    setManutencionMonth(next.month);
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    setImportMessage(`Procesando ${file.name}...`);

    try {
      const rows = await importTicketRestaurantAbsencesFromFile(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      if (rows.length === 0) {
        setPreviewRows([]);
        setEditingAbsenceId(null);
        setIsPreviewOpen(false);
        setImportMessage(
          'No se han detectado ausencias importables. El fichero debe tener formato limpio o ZERKOS.',
        );
        return;
      }

      const activePersonRows = rows.filter((row) =>
        activeTicketEmployeeNumbers.has(normalizeTicketEmployeeNumber(row.empleado)),
      );
      const rowsWithCalendarImpact = applyCalendarTicketImpactToPreviewRows(activePersonRows);
      const rowsWithTicketRight = rowsWithCalendarImpact.filter(
        (row) => row.errors.length > 0 || row.afectaTicket,
      );
      const ignoredWithoutActiveRight = rows.length - activePersonRows.length;
      const ignoredWithoutTicketDay = rowsWithCalendarImpact.length - rowsWithTicketRight.length;
      const rowsWithErrors = rowsWithTicketRight.filter((row) => row.errors.length > 0).length;

      if (rowsWithTicketRight.length === 0) {
        setPreviewRows([]);
        setEditingAbsenceId(null);
        setIsPreviewOpen(false);
        setImportMessage(
          [
            'No se ha importado ninguna ausencia.',
            ignoredWithoutActiveRight > 0
              ? `${ignoredWithoutActiveRight} fila(s) pertenecen a personas sin derecho activo a Ticket Restaurante.`
              : '',
            ignoredWithoutTicketDay > 0
              ? `${ignoredWithoutTicketDay} fila(s) no coinciden con ningún día que genere ticket según el calendario asignado.`
              : '',
          ]
            .filter(Boolean)
            .join(' '),
        );
        return;
      }

      setEditingAbsenceId(null);
      setPreviewRows(rowsWithTicketRight);
      setImportMessage(
        [
          `Ausencias detectadas: ${rows.length}.`,
          `A revisar: ${rowsWithTicketRight.length}.`,
          ignoredWithoutActiveRight > 0
            ? `Ignoradas por persona sin derecho activo: ${ignoredWithoutActiveRight}.`
            : '',
          ignoredWithoutTicketDay > 0
            ? `Ignoradas sin día con derecho a ticket: ${ignoredWithoutTicketDay}.`
            : '',
          rowsWithErrors > 0 ? `Con errores pendientes de corregir: ${rowsWithErrors}.` : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
      setIsPreviewOpen(true);
    } catch (error) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setPreviewRows([]);
      setEditingAbsenceId(null);
      setIsPreviewOpen(false);
      setImportMessage(
        error instanceof Error
          ? `No se ha podido importar el fichero: ${error.message}`
          : 'No se ha podido importar el fichero por un error no identificado.',
      );
    }
  };

  const handlePeopleImportFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    const result = await importTicketPeopleFromFile(file, employees, calendars);
    if (peopleFileInputRef.current) {
      peopleFileInputRef.current.value = '';
    }

    if (result.drafts.length === 0) {
      setPeopleImportMessage(
        'No se ha importado ninguna persona. Revisa Nº empleado y Calendario.',
      );
      return;
    }

    const saveResult = await importPeople(result.drafts);
    if (!saveResult.ok) {
      setPeopleImportMessage(
        saveResult.message ??
          'No se han podido importar las personas. Recarga e inténtalo de nuevo.',
      );
      return;
    }

    const missingText =
      result.missingEmployees.length > 0
        ? ` · No encontrados en Plantilla: ${result.missingEmployees.join(', ')}`
        : '';
    const ignoredText = result.ignored > 0 ? ` · Filas ignoradas: ${result.ignored}` : '';
    const duplicateText =
      result.duplicateRows > 0 ? ` · Duplicados en Excel: ${result.duplicateRows}` : '';

    setPeopleImportMessage(
      `Procesadas: ${saveResult.imported} · Nuevas: ${saveResult.created} · Actualizadas: ${saveResult.updated} · Sin cambios: ${saveResult.unchanged} · Calendarios creados: ${saveResult.createdCalendars}${ignoredText}${duplicateText}${missingText}`,
    );
  };

  const updatePreviewRow = (
    rowId: string,
    field: keyof Omit<TicketRestaurantAbsencePreviewRow, 'id' | 'errors'>,
    value: string | boolean,
  ) => {
    setPreviewRows((rows) =>
      rows.map((row) => (row.id === rowId ? { ...row, [field]: value, errors: [] } : row)),
    );
  };

  const addPreviewRow = () => {
    setPreviewRows((rows) => [
      ...rows,
      {
        id: `preview-manual-${Date.now()}`,
        empleado: '',
        nombreApellidos: '',
        desde: '',
        hasta: '',
        motivo: '',
        totalDias: '',
        afectaTicket: true,
        errors: [],
      },
    ]);
  };

  const removePreviewRow = (rowId: string) => {
    setPreviewRows((rows) => rows.filter((row) => row.id !== rowId));
  };

  const savePreviewRows = async () => {
    const currentAbsences = editingAbsenceId
      ? absences.filter((absence) => absence.id !== editingAbsenceId)
      : absences;
    const rowsWithCalendarImpact = applyCalendarTicketImpactToPreviewRows(previewRows);
    const result = saveTicketRestaurantAbsencePreviewRows(currentAbsences, rowsWithCalendarImpact);
    if (result.errors.length > 0) {
      setPreviewRows(validateTicketRestaurantAbsencePreviewRows(rowsWithCalendarImpact));
      setImportMessage(result.errors.join(' '));
      return;
    }

    const saveResult = await saveAbsences(result.absences);
    if (!saveResult.ok) {
      setImportMessage(
        saveResult.message ??
          'No se han podido guardar las ausencias. Recarga e inténtalo de nuevo.',
      );
      return;
    }
    setImportMessage(formatSaveSummary(result));
    setPreviewRows([]);
    setEditingAbsenceId(null);
    setIsPreviewOpen(false);
  };

  const editAbsence = useCallback((absence: TicketRestaurantAbsence) => {
    setEditingAbsenceId(absence.id);
    setPreviewRows([toAbsencePreviewRow(absence)]);
    setImportMessage('Edita la ausencia y confirma para guardar los cambios.');
    setIsPreviewOpen(true);
  }, []);

  const handleRemoveAbsence = (absenceId: string) => {
    void (async () => {
      const result = await removeAbsence(absenceId);
      if (!result.ok) {
        await alert(result.message ?? 'No se ha podido eliminar la ausencia.');
      }
    })();
  };

  const handleManutencionesImportFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    setManutencionImportMessage(`Procesando ${file.name}...`);

    try {
      const rows = await importTicketManutencionesFromFile(file, visiblePeople);
      const validatedRows = validateTicketManutencionPreviewRows(rows);
      setManutencionPreviewRows(validatedRows);
      setManutencionImportMessage(
        validatedRows.length > 0
          ? `Detectadas ${validatedRows.length} manutenciones con derecho a ticket.`
          : 'No se han detectado manutenciones de personas con derecho a ticket.',
      );
    } catch (error) {
      setManutencionImportMessage(
        error instanceof Error ? error.message : 'No se pudo importar el fichero de manutenciones.',
      );
    } finally {
      if (manutencionesFileInputRef.current) {
        manutencionesFileInputRef.current.value = '';
      }
    }
  };

  const addManualManutencionPreviewRow = () => {
    const person = visiblePeople.find(
      (candidate) =>
        normalizeTicketEmployeeSearch(candidate.empleado) ===
        normalizeTicketEmployeeSearch(manualManutencionEmployee),
    );

    if (!person || !manualManutencionDate) {
      return;
    }

    setManutencionPreviewRows((currentRows) =>
      validateTicketManutencionPreviewRows([
        ...currentRows,
        {
          id: `manutencion-manual-${person.empleado}-${manualManutencionDate}-${Date.now()}`,
          empleado: person.empleado,
          nombreApellidos: person.nombreApellidos,
          fechaGasto: manualManutencionDate,
          origen: 'Manual',
          importar: true,
          afectaTicket: true,
          errors: [],
        },
      ]),
    );
    setManualManutencionEmployee('');
    setManualManutencionDate('');
  };

  const saveManutencionPreview = () => {
    const validatedRows = validateTicketManutencionPreviewRows(manutencionPreviewRows);
    setManutencionPreviewRows(validatedRows);

    if (validatedRows.some((row) => row.errors.length > 0)) {
      setManutencionImportMessage('Hay filas con errores. Corrígelas antes de guardar.');
      return;
    }

    if (!validatedRows.some((row) => row.importar)) {
      setManutencionImportMessage('No hay filas marcadas para importar.');
      return;
    }

    setIsManutencionMonthModalOpen(true);
  };

  const confirmSaveManutencionPreview = () => {
    const drafts: TicketManutencionDraft[] = manutencionPreviewRows
      .filter((row) => row.importar && row.errors.length === 0)
      .map((row) => ({
        empleado: row.empleado,
        nombreApellidos: row.nombreApellidos,
        fechaGasto: row.fechaGasto,
        origen: row.origen,
        afectaTicket: row.afectaTicket,
        imputacionYear: manutencionImputationYear,
        imputacionMonth: manutencionImputationMonth,
      }));

    const existingKeys = new Set(
      manutenciones
        .filter((row) => !row.deletedAt)
        .map(
          (row) =>
            `${normalizeTicketEmployeeNumber(row.empleado)}|${row.fechaGasto}|${row.imputacionYear}|${row.imputacionMonth}`,
        ),
    );
    let duplicates = 0;
    let saved = 0;
    drafts.forEach((draft) => {
      const key = `${normalizeTicketEmployeeNumber(draft.empleado)}|${draft.fechaGasto}|${draft.imputacionYear}|${draft.imputacionMonth}`;
      if (existingKeys.has(key)) {
        duplicates += 1;
        return;
      }
      existingKeys.add(key);
      saved += 1;
    });

    void (async () => {
      const result = await saveManutenciones(drafts);
      if (!result.ok) {
        setManutencionImportMessage(
          result.message ??
            'No se han podido guardar las manutenciones. Recarga e inténtalo de nuevo.',
        );
        return;
      }
      setManutencionPreviewRows([]);
      setIsManutencionMonthModalOpen(false);
      setManutencionYear(manutencionImputationYear);
      setManutencionMonth(manutencionImputationMonth);
      const duplicateText = duplicates > 0 ? ` Duplicadas omitidas: ${duplicates}.` : '';
      setManutencionImportMessage(
        `Manutenciones guardadas: ${saved}.${duplicateText} Imputación: ${formatManutencionMonth(
          manutencionImputationYear,
          manutencionImputationMonth,
        )}.`,
      );
    })();
  };

  const handleRemoveManutencion = (manutencionId: string) => {
    void (async () => {
      const result = await removeManutencion(manutencionId);
      if (!result.ok) {
        setManutencionImportMessage(result.message ?? 'No se ha podido eliminar la manutención.');
      }
    })();
  };

  const moveManutencionImputationMonth = (offset: number) => {
    const next = addYearMonth(manutencionImputationYear, manutencionImputationMonth, offset);
    setManutencionImputationYear(next.year);
    setManutencionImputationMonth(next.month);
  };

  useEffect(() => {
    if (!initialAbsenceId || navigationNonce === undefined) {
      return;
    }

    if (processedNavigationNonceRef.current === navigationNonce) {
      return;
    }

    const targetAbsence = absences.find((absence) => absence.id === initialAbsenceId);
    if (!targetAbsence) {
      return;
    }

    const parsedDate = new Date(`${targetAbsence.desde}T00:00:00`);
    if (!Number.isNaN(parsedDate.getTime())) {
      setAbsenceYear(parsedDate.getFullYear());
      setAbsenceMonth(parsedDate.getMonth() + 1);
    }

    setActiveSubview('ausencias');
    editAbsence(targetAbsence);
    processedNavigationNonceRef.current = navigationNonce;
  }, [absences, editAbsence, initialAbsenceId, navigationNonce]);

  const createManualDebt = async (draft: TicketManualDebtDraft) => {
    const now = new Date().toISOString();
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `ticket-manual-debt-${Date.now()}`;
    const debt = buildTicketManualDebt(draft, now, id);
    return updateConfig({
      ...config,
      manualDebts: [...(config.manualDebts ?? []), debt],
    });
  };

  const updateManualDebt = async (id: string, draft: TicketManualDebtDraft) => {
    const existing = (config.manualDebts ?? []).find((debt) => debt.id === id);
    if (!existing) {
      return { ok: false, message: 'No se ha encontrado la deuda manual que quieres modificar.' };
    }
    const now = new Date().toISOString();
    const updated = buildTicketManualDebt(draft, now, existing.id);
    return updateConfig({
      ...config,
      manualDebts: (config.manualDebts ?? []).map((debt) =>
        debt.id === id
          ? {
              ...updated,
              createdAt: existing.createdAt,
              cancelledAt: existing.cancelledAt,
              cancellationReason: existing.cancellationReason,
            }
          : debt,
      ),
    });
  };

  const cancelManualDebt = async (id: string, reason: string) => {
    const now = new Date().toISOString();
    return updateConfig({
      ...config,
      manualDebts: (config.manualDebts ?? []).map((debt) =>
        debt.id === id
          ? { ...debt, cancelledAt: now, cancellationReason: reason.trim(), updatedAt: now }
          : debt,
      ),
    });
  };

  const saveDebtRegularization = async (draft: TicketDebtRegularizationDraft) => {
    const now = new Date().toISOString();
    const existing = (config.debtRegularizations ?? []).find(
      (item) =>
        normalizeTicketEmployeeNumber(item.empleado) === normalizeTicketEmployeeNumber(draft.empleado) &&
        item.year === draft.year &&
        item.month === draft.month,
    );
    const id = existing?.id ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `ticket-debt-regularization-${Date.now()}`);
    const regularization = buildTicketDebtRegularization(draft, now, id);
    return updateConfig({
      ...config,
      debtRegularizations: existing
        ? (config.debtRegularizations ?? []).map((item) =>
            item.id === existing.id
              ? { ...regularization, createdAt: existing.createdAt }
              : item,
          )
        : [...(config.debtRegularizations ?? []), regularization],
    });
  };

  return (
    <section
      className="space-y-2"
      id="ticket-restaurante"
    >
      <PageHeader
        helpSections={TICKET_RESTAURANTE_HELP_SECTIONS}
        helpSubtitle="Guía rápida de uso, reglas principales e importaciones del módulo."
        title="Ticket Restaurante"
      />

      <input
        accept=".xlsx,.csv,.tsv"
        className="hidden"
        onChange={(event) => void handleImportFile(event.target.files?.[0] ?? null)}
        ref={fileInputRef}
        type="file"
      />
      <input
        accept=".xlsx,.csv,.tsv"
        className="hidden"
        onChange={(event) => void handlePeopleImportFile(event.target.files?.[0] ?? null)}
        ref={peopleFileInputRef}
        type="file"
      />
      <input
        accept=".xlsx,.csv,.tsv"
        className="hidden"
        onChange={(event) => void handleManutencionesImportFile(event.target.files?.[0] ?? null)}
        ref={manutencionesFileInputRef}
        type="file"
      />

      {activeSubview ? (
      <div className="mb-3 flex flex-col gap-2 rounded-xl border border-metro-border bg-metro-panel p-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <SubviewButton
            active={false}
            label="← Inicio"
            onClick={() => setActiveSubview(null)}
          />
          <SubviewButton
            active={activeSubview === 'calendarios'}
            label="Calendarios"
            onClick={() => setActiveSubview('calendarios')}
          />
          <SubviewButton
            active={activeSubview === 'personas'}
            label="Personas"
            onClick={() => setActiveSubview('personas')}
          />
          <SubviewButton
            active={activeSubview === 'computoMensual'}
            label="Cómputo mensual"
            onClick={() => setActiveSubview('computoMensual')}
          />
          <SubviewButton
            active={activeSubview === 'computoCotizacion'}
            label="Cómputo cotización"
            onClick={() => setActiveSubview('computoCotizacion')}
          />
          <SubviewButton
            active={activeSubview === 'ausencias'}
            label="Ausencias"
            onClick={() => setActiveSubview('ausencias')}
          />
          <SubviewButton
            active={activeSubview === 'manutenciones'}
            label="Manutenciones"
            onClick={() => setActiveSubview('manutenciones')}
          />
          <SubviewButton
            active={activeSubview === 'deudaManual'}
            label="Deudas"
            onClick={() => setActiveSubview('deudaManual')}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <ActionButton icon={Euro} iconOnly={false} onClick={() => setIsPriceModalOpen(true)} size="sm" variant="secondary">
            Precio ticket
          </ActionButton>
          <ActionButton icon={Settings} iconOnly={false} onClick={() => setIsRulesModalOpen(true)} size="sm" variant="secondary">
            Reglas de cálculo
          </ActionButton>
        </div>
      </div>
      ) : null}

      {activeSubview === null ? (
        <TicketRestauranteWorkflow
          activeCalendars={visibleCalendars.filter((calendar) => calendar.activo).length}
          activePeople={workflowActivePeople}
          absenceCount={workflowAbsenceCount}
          calculation={monthCalculation}
          effectiveTicketPrice={getEffectiveTicketPrice(config, calculationYear, calculationMonth)}
          inactivePeople={workflowInactivePeople}
          manutencionCount={workflowManutencionCount}
          manualDebtCount={(config.manualDebts ?? []).filter((debt) => !debt.cancelledAt).length}
          month={calculationMonth}
          onImportAbsences={() => {
            setActiveSubview('ausencias');
            fileInputRef.current?.click();
          }}
          onImportManutenciones={() => {
            setActiveSubview('manutenciones');
            manutencionesFileInputRef.current?.click();
          }}
          onImportPeople={() => {
            setActiveSubview('personas');
            peopleFileInputRef.current?.click();
          }}
          onMonthChange={(nextMonth) => {
            setCalculationMonth(nextMonth);
            setAbsenceMonth(nextMonth);
            setManutencionImputationMonth(nextMonth);
            setManutencionMonth(nextMonth);
          }}
          onOpenAbsences={() => setActiveSubview('ausencias')}
          onOpenCalendars={() => setActiveSubview('calendarios')}
          onOpenContribution={() => setActiveSubview('computoCotizacion')}
          onOpenManutenciones={() => setActiveSubview('manutenciones')}
          onOpenManualDebt={() => setActiveSubview('deudaManual')}
          onOpenMonthlyCalculation={() => setActiveSubview('computoMensual')}
          onOpenPeople={() => setActiveSubview('personas')}
          onOpenPrice={() => setIsPriceModalOpen(true)}
          onOpenRules={() => setIsRulesModalOpen(true)}
          onYearChange={(nextYear) => {
            setCalculationYear(nextYear);
            setAbsenceYear(nextYear);
            setManutencionImputationYear(nextYear);
            setManutencionYear(nextYear);
          }}
          year={calculationYear}
        />
      ) : activeSubview === 'calendarios' ? (
        <>
          <CalendarToolbar
            calendars={visibleCalendars}
            draft={calendarDraft}
            editingCalendarId={editingCalendarId}
            onCancel={resetForm}
            onChange={setCalendarDraft}
            onEdit={editCalendar}
            onRemove={removeCalendarAndPeople}
            onSave={saveCalendar}
            onToggleActive={handleToggleCalendarActive}
            onYearChange={handleYearChange}
            selectedCalendar={selectedCalendar ?? undefined}
            selectedCalendarId={selectedCalendarId}
            setSelectedCalendarId={setSelectedCalendarId}
            setYear={setYear}
            year={year}
          />

          <div className="rounded-xl border border-metro-border bg-metro-panel p-2.5">
            <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-base font-bold text-metro-text">
                  <CalendarDays className="h-4 w-4 text-metro-red" />
                  Vista anual {year}
                </h3>
                <p className="text-xs text-metro-muted">
                  Pulsa un día para marcarlo o desmarcarlo como sin ticket.
                </p>
              </div>
              <Legend />
            </div>

            {selectedCalendar ? (
              <div className="grid gap-2 lg:grid-cols-3">
                {yearCalendar.map((month) => (
                  <MonthCalendar
                    key={month.mes}
                    monthName={month.nombre}
                    leadingBlanks={month.blancosIniciales}
                    days={month.dias}
                    onToggleDay={(fecha) => handleToggleDay(selectedCalendar.id, fecha)}
                  />
                ))}
              </div>
            ) : (
              <EmptyCalendar />
            )}
          </div>
        </>
      ) : activeSubview === 'personas' ? (
        <PeoplePanel
          calendars={visibleCalendars}
          employees={employees.filter((employee) => !employee.deletedAt)}
          draft={personDraft}
          editingPersonId={editingPersonId}
          onCancel={resetPersonForm}
          onChange={setPersonDraft}
          onEdit={editPerson}
          importMessage={peopleImportMessage}
          exportPayload={{
            title: 'Personas Ticket Restaurante',
            filename: 'ticket-restaurante-personas',
            columns: ticketPersonExportColumns(visibleCalendars),
            rows: visiblePeople,
          }}
          onExportModel={() =>
            exportCsv('modelo-personas-ticket-restaurante.csv', PEOPLE_EXPORT_HEADERS, [])
          }
          onImport={() => peopleFileInputRef.current?.click()}
          onRemove={handleRemovePerson}
          onSave={savePerson}
          people={visiblePeople}
        />
      ) : activeSubview === 'computoMensual' ? (
        <>
          <CalculationPanel
          absences={calculationAbsences}
          calendars={visibleCalendars}
          calculation={monthCalculation}
          config={config}
          mode="monthly"
          month={calculationMonth}
          exportPayload={{
            title: 'Cómputo mensual Ticket Restaurante',
            filename: `Computo_${MONTH_OPTIONS[calculationMonth - 1]?.label ?? calculationMonth}_${calculationYear}`,
            columns: monthlyCalculationExportColumns(
              config,
              calculationYear,
              calculationMonth,
              calculationAbsences,
            ),
            rows: sortMonthlyCalculationRows(monthCalculation.rows),
            rowGroupValue: (row) => row.calendario,
            filterLabel: buildFilterLabel([
              ['Mes', calculationMonth],
              ['Año', calculationYear],
            ]),
            formatPreset: 'ticket-restaurante-monthly',
          }}
          onMonthChange={handleCalculationMonthChange}
          onNextMonth={() => moveCalculationMonth(1)}
          onPreviousMonth={() => moveCalculationMonth(-1)}
          onYearChange={handleCalculationYearChange}
          year={calculationYear}
          />
          <TicketRestauranteManualPeoplePanel
            config={config}
            employees={employees}
            month={calculationMonth}
            onUpdateConfig={updateConfig}
            regularPeople={visiblePeople}
            year={calculationYear}
          />
        </>
      ) : activeSubview === 'computoCotizacion' ? (
        <CalculationPanel
          absences={calculationAbsences}
          calendars={visibleCalendars}
          calculation={contributionCalculation}
          config={config}
          mode="contribution"
          month={calculationMonth}
          exportPayload={{
            title: 'Cómputo cotización Ticket Restaurante',
            filename: `Computo_${MONTH_OPTIONS[calculationMonth - 1]?.label ?? calculationMonth}_Base_Cotizacion_y_Retribucion_${calculationYear}`,
            columns: contributionCalculationExportColumns(
              getEffectiveTicketPrice(config, calculationYear, calculationMonth),
            ),
            rows: sortContributionCalculationRows(contributionCalculation.rows),
            rowGroupValue: (row) => row.calendario,
            filterLabel: buildFilterLabel([
              ['Mes', calculationMonth],
              ['Año', calculationYear],
            ]),
            formatPreset: 'ticket-restaurante-contribution',
          }}
          onMonthChange={handleCalculationMonthChange}
          onNextMonth={() => moveCalculationMonth(1)}
          onPreviousMonth={() => moveCalculationMonth(-1)}
          onYearChange={handleCalculationYearChange}
          year={calculationYear}
        />
      ) : activeSubview === 'ausencias' ? (
        <AbsencesTable
          absences={visibleAbsences}
          exportPayload={{
            title: 'Ausencias Ticket Restaurante',
            filename: `ticket-restaurante-ausencias-${absenceYear}-${String(absenceMonth).padStart(2, '0')}`,
            columns: absenceExportColumns,
            rows: visibleAbsences,
            filterLabel: buildFilterLabel([
              ['Mes', absenceMonth],
              ['Año', absenceYear],
            ]),
          }}
          importMessage={importMessage}
          month={absenceMonth}
          onEdit={editAbsence}
          onExportModel={() =>
            exportCsv('modelo-ausencias-ticket-restaurante.csv', ABSENCE_MODEL_HEADERS, [])
          }
          onImport={() => setIsAbsenceImportHelpOpen(true)}
          onMonthChange={handleAbsenceMonthChange}
          onNextMonth={() => moveAbsenceMonth(1)}
          onPreviousMonth={() => moveAbsenceMonth(-1)}
          onRemove={handleRemoveAbsence}
          onYearChange={handleAbsenceYearChange}
          year={absenceYear}
        />
      ) : activeSubview === 'manutenciones' ? (
        <ManutencionesPanel
          importMessage={manutencionImportMessage}
          manualDate={manualManutencionDate}
          manualEmployee={manualManutencionEmployee}
          manutenciones={visibleManutenciones}
          month={manutencionMonth}
          onAddManual={addManualManutencionPreviewRow}
          onExportModel={() =>
            exportCsv(
              'modelo-manutenciones-ticket-restaurante.csv',
              MANUTENCIONES_MODEL_HEADERS,
              [],
            )
          }
          onImport={() => manutencionesFileInputRef.current?.click()}
          onMonthChange={handleManutencionMonthChange}
          onNextMonth={() => moveManutencionListMonth(1)}
          onPreviousMonth={() => moveManutencionListMonth(-1)}
          onManualDateChange={setManualManutencionDate}
          onManualEmployeeChange={setManualManutencionEmployee}
          onPreviewChange={(rows) =>
            setManutencionPreviewRows(validateTicketManutencionPreviewRows(rows))
          }
          onRemove={handleRemoveManutencion}
          onSavePreview={saveManutencionPreview}
          onYearChange={handleManutencionYearChange}
          previewRows={manutencionPreviewRows}
          ticketPeople={visiblePeople}
          year={manutencionYear}
        />
      ) : activeSubview === 'deudaManual' ? (
        <TicketRestauranteManualDebtPanel
          calculation={monthCalculation}
          debts={config.manualDebts ?? []}
          regularizations={config.debtRegularizations ?? []}
          month={calculationMonth}
          onCancel={cancelManualDebt}
          onCreate={createManualDebt}
          onUpdate={updateManualDebt}
          onSaveRegularization={saveDebtRegularization}
          onMonthChange={handleCalculationMonthChange}
          onYearChange={handleCalculationYearChange}
          onPreviousMonth={() => moveCalculationMonth(-1)}
          onNextMonth={() => moveCalculationMonth(1)}
          people={visiblePeople}
          year={calculationYear}
        />
      ) : null}

      {isAbsenceImportHelpOpen ? (
        <ModalShell
          labelledBy="absence-import-help-title"
          maxWidthClassName="max-w-lg"
          onClose={() => setIsAbsenceImportHelpOpen(false)}
        >
          <ModalHeader>
            <ModalTitle
              id="absence-import-help-title"
              subtitle="Obtén primero el Excel de ausencias y después selecciónalo para importarlo."
            >
              Importar ausencias
            </ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-3 text-sm text-metro-text">
              <div className="rounded-lg border border-metro-border bg-metro-surface p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-metro-muted">
                  Cómo obtener el Excel en Zerkos
                </p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Entrar en <strong>Supervisión</strong>.</li>
                  <li>Abrir <strong>Justif. Ausencias de día</strong>.</li>
                  <li>Seleccionar las fechas del <strong>último mes</strong>.</li>
                  <li>Exportar el resultado a <strong>Excel</strong>.</li>
                </ol>
              </div>
              <p className="text-xs leading-relaxed text-metro-muted">
                Al importar, solo se cargarán ausencias de personas activas con derecho a Ticket
                Restaurante que coincidan al menos con un día que genere ticket según su calendario.
                Fines de semana, festivos y otros días sin derecho a ticket se ignorarán.
              </p>
            </div>
          </ModalBody>
          <ModalFooter>
            <ActionButton
              iconOnly={false}
              onClick={() => setIsAbsenceImportHelpOpen(false)}
              variant="secondary"
            >
              Cancelar
            </ActionButton>
            <ActionButton
              iconOnly={false}
              onClick={() => {
                setIsAbsenceImportHelpOpen(false);
                fileInputRef.current?.click();
              }}
              variant="import"
            >
              Seleccionar Excel
            </ActionButton>
          </ModalFooter>
        </ModalShell>
      ) : null}

      {isManutencionMonthModalOpen ? (
        <ModalShell
          labelledBy="manutencion-month-title"
          maxWidthClassName="max-w-md"
          onClose={() => setIsManutencionMonthModalOpen(false)}
        >
          <ModalHeader>
            <ModalTitle
              id="manutencion-month-title"
              subtitle="Las notas de gasto marcadas como afectantes descontarán tickets en este mes."
            >
              ¿A qué mes lo imputamos?
            </ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="flex items-center justify-center gap-3 py-2">
              <ActionButton iconOnly onClick={() => moveManutencionImputationMonth(-1)} variant="secondary">←</ActionButton>
              <div className="min-w-44 rounded-xl bg-metro-panel px-4 py-3 text-center text-base font-bold text-metro-text">
                {formatManutencionMonth(manutencionImputationYear, manutencionImputationMonth)}
              </div>
              <ActionButton iconOnly onClick={() => moveManutencionImputationMonth(1)} variant="secondary">→</ActionButton>
            </div>
          </ModalBody>
          <ModalFooter>
            <ActionButton iconOnly={false} onClick={() => setIsManutencionMonthModalOpen(false)} variant="secondary">Cancelar</ActionButton>
            <ActionButton iconOnly={false} onClick={confirmSaveManutencionPreview} variant="save">Guardar</ActionButton>
          </ModalFooter>
        </ModalShell>
      ) : null}

      {isPriceModalOpen ? (
        <TicketPriceModal
          config={config}
          onClose={() => setIsPriceModalOpen(false)}
          onSave={async (nextConfig) => {
            const result = await updateConfig(nextConfig);
            if (!result.ok) {
              await alert(result.message ?? 'No se ha podido guardar el precio del ticket.');
              return;
            }
            setIsPriceModalOpen(false);
          }}
        />
      ) : null}

      {isRulesModalOpen ? (
        <TicketRulesModal
          config={config}
          onClose={() => setIsRulesModalOpen(false)}
          onSave={async (nextConfig) => {
            const result = await updateConfig(nextConfig);
            if (!result.ok) {
              await alert(result.message ?? 'No se han podido guardar las reglas de cálculo.');
              return;
            }
            setIsRulesModalOpen(false);
          }}
        />
      ) : null}

      {isPreviewOpen ? (
        <AbsencePreviewModal
          onAdd={addPreviewRow}
          onCancel={() => {
            setIsPreviewOpen(false);
            setEditingAbsenceId(null);
            setPreviewRows([]);
          }}
          onChange={updatePreviewRow}
          onRemove={removePreviewRow}
          onSave={savePreviewRows}
          rows={previewRows}
        />
      ) : null}
      {dialogNode}
    </section>
  );
}
