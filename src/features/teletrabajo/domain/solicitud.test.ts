import { describe, expect, it } from 'vitest';
import {
  TELETRABAJO_EQUIPMENT_BASE_DELIVERY_DATE,
  getDefaultEquipmentDeliveryDate,
} from './solicitud';

describe('getDefaultEquipmentDeliveryDate', () => {
  it('mantiene 01/09/2024 como fecha base en renovaciones', () => {
    expect(getDefaultEquipmentDeliveryDate('2027-2028', 'renovacion')).toBe(
      TELETRABAJO_EQUIPMENT_BASE_DELIVERY_DATE,
    );
  });

  it('usa el 1 de septiembre del año de inicio para una solicitud nueva', () => {
    expect(getDefaultEquipmentDeliveryDate('2027-2028', 'nueva')).toBe('2027-09-01');
    expect(getDefaultEquipmentDeliveryDate('2028-2029', 'nueva')).toBe('2028-09-01');
  });

  it('no inventa una fecha si el periodo no permite obtener el año de inicio', () => {
    expect(getDefaultEquipmentDeliveryDate('', 'nueva')).toBe('');
    expect(getDefaultEquipmentDeliveryDate('periodo actual', 'nueva')).toBe('');
  });
});
