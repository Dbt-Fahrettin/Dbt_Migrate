import { describe, expect, it } from 'vitest';
import { validateRequeryForm, type RequeryForm } from './requeryForm';

function form(overrides: Partial<RequeryForm> = {}): RequeryForm {
    return {
        packNo: '500292',
        startDate: '2026-09-01',
        endDate: '',
        taxNumberOrIdn: '',
        chunkDays: '7',
        budgetSeconds: '60',
        ...overrides,
    };
}

describe('validateRequeryForm', () => {
    it('geçerli formu kabul eder', () => {
        expect(validateRequeryForm(form())).toBeNull();
        expect(validateRequeryForm(form({ endDate: '2026-09-30' }))).toBeNull();
    });

    it('paket no zorunlu ve pozitif sayı olmalı', () => {
        expect(validateRequeryForm(form({ packNo: '' }))).toContain('boş olamaz');
        expect(validateRequeryForm(form({ packNo: 'abc' }))).toContain('pozitif');
        expect(validateRequeryForm(form({ packNo: '0' }))).toContain('pozitif');
        expect(validateRequeryForm(form({ packNo: '-5' }))).toContain('pozitif');
    });

    it('başlangıç tarihi zorunlu', () => {
        expect(validateRequeryForm(form({ startDate: '' }))).toContain('Başlangıç tarihi');
    });

    it('bitiş tarihi başlangıçtan önce olamaz, eşit olabilir', () => {
        expect(validateRequeryForm(form({ startDate: '2026-09-10', endDate: '2026-09-01' }))).toContain(
            'önce olamaz',
        );
        expect(validateRequeryForm(form({ startDate: '2026-09-10', endDate: '2026-09-10' }))).toBeNull();
    });

    /** Sınırlar sunucudaki PackRequeryRequest ile aynı; hatayı uzun iş başlamadan göstermek için. */
    it('parça gün 1-31 aralığında olmalı', () => {
        expect(validateRequeryForm(form({ chunkDays: '0' }))).toContain('Parça gün');
        expect(validateRequeryForm(form({ chunkDays: '32' }))).toContain('Parça gün');
        expect(validateRequeryForm(form({ chunkDays: '1' }))).toBeNull();
        expect(validateRequeryForm(form({ chunkDays: '31' }))).toBeNull();
    });

    it('çağrı bütçesi 30-480 sn aralığında olmalı', () => {
        expect(validateRequeryForm(form({ budgetSeconds: '29' }))).toContain('bütçesi');
        expect(validateRequeryForm(form({ budgetSeconds: '481' }))).toContain('bütçesi');
        expect(validateRequeryForm(form({ budgetSeconds: '30' }))).toBeNull();
        expect(validateRequeryForm(form({ budgetSeconds: '480' }))).toBeNull();
    });
});
