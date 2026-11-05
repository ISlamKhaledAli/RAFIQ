import type { ControlledMandatoryFields } from '../types/pharma';

// The host stores the controlled-drug mandatory fields as a list of snake_case ids
// (ControlledDrugService.GetMandatoryFields / SaveMandatoryFields); screens work with named booleans.
const HOST_FIELD_IDS: Record<keyof ControlledMandatoryFields, string> = {
  requirePatientNationalId: 'patient_national_id',
  requireDoctorLicense: 'doctor_license_no',
  requireDoctorName: 'doctor_name',
  requirePrescriptionNo: 'prescription_no',
  requirePrescriptionDate: 'prescription_date',
  requirePatientPhone: 'patient_phone',
};

// The host always requires these (it re-adds them on every save), so the UI shows them as locked.
export const ALWAYS_REQUIRED_MANDATORY_FIELDS: ReadonlyArray<keyof ControlledMandatoryFields> = [
  'requireDoctorName',
  'requirePrescriptionDate',
];

const ALWAYS_REQUIRED_HOST_IDS = ['patient_name', 'doctor_name', 'prescription_date'];

const FIELD_KEYS = Object.keys(HOST_FIELD_IDS) as Array<keyof ControlledMandatoryFields>;

/** Accepts the host list of ids (or an already-named object) and returns the named booleans. */
export function parseMandatoryFields(raw: unknown): ControlledMandatoryFields {
  const ids = new Set<string>(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  const named = !Array.isArray(raw) && raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const out = {} as ControlledMandatoryFields;
  for (const key of FIELD_KEYS) {
    out[key] = named && typeof named[key] === 'boolean' ? (named[key] as boolean) : ids.has(HOST_FIELD_IDS[key]);
  }
  for (const locked of ALWAYS_REQUIRED_MANDATORY_FIELDS) out[locked] = true;
  return out;
}

/** The list of ids the host expects on save; the always-required ids are included explicitly. */
export function toHostMandatoryFields(fields: ControlledMandatoryFields): string[] {
  const ids = [...ALWAYS_REQUIRED_HOST_IDS];
  for (const key of FIELD_KEYS) {
    const id = HOST_FIELD_IDS[key];
    if (fields[key] && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
