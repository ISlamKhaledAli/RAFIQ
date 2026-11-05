import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMandatoryFields, toHostMandatoryFields } from '../src/utils/controlledMandatoryFields.ts';

describe('controlled drug mandatory fields (host list of ids <-> named booleans)', () => {
  it('maps the host default list: only the three always-required fields are on', () => {
    const f = parseMandatoryFields(['patient_name', 'doctor_name', 'prescription_date']);
    assert.deepEqual(f, {
      requirePatientNationalId: false,
      requireDoctorLicense: false,
      requireDoctorName: true,
      requirePrescriptionNo: false,
      requirePrescriptionDate: true,
      requirePatientPhone: false,
    });
  });

  it('maps optional ids to their toggles', () => {
    const f = parseMandatoryFields(['patient_name', 'doctor_name', 'prescription_date', 'patient_national_id', 'patient_phone']);
    assert.equal(f.requirePatientNationalId, true);
    assert.equal(f.requirePatientPhone, true);
    assert.equal(f.requireDoctorLicense, false);
    assert.equal(f.requirePrescriptionNo, false);
  });

  it('always reports the host-locked fields as required, whatever the input', () => {
    for (const raw of [[], null, undefined, {}, { success: true }, { requireDoctorName: false, requirePrescriptionDate: false }]) {
      const f = parseMandatoryFields(raw);
      assert.equal(f.requireDoctorName, true);
      assert.equal(f.requirePrescriptionDate, true);
    }
  });

  it('still understands an already-named object', () => {
    const f = parseMandatoryFields({ requirePatientNationalId: true, requirePatientPhone: true });
    assert.equal(f.requirePatientNationalId, true);
    assert.equal(f.requirePatientPhone, true);
    assert.equal(f.requireDoctorLicense, false);
  });

  it('builds the list the host expects on save, without duplicates', () => {
    const ids = toHostMandatoryFields({
      requirePatientNationalId: true,
      requireDoctorLicense: false,
      requireDoctorName: true,
      requirePrescriptionNo: true,
      requirePrescriptionDate: true,
      requirePatientPhone: false,
    });
    assert.deepEqual(ids, ['patient_name', 'doctor_name', 'prescription_date', 'patient_national_id', 'prescription_no']);
  });

  it('round-trips through the host format', () => {
    const start = parseMandatoryFields(['patient_name', 'doctor_name', 'prescription_date', 'doctor_license_no']);
    assert.deepEqual(parseMandatoryFields(toHostMandatoryFields(start)), start);
  });
});
