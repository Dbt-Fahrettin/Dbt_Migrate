import { describe, expect, it } from 'vitest';
import { describeDbsStatusFailure } from '../../api/dbsAutoSend';
import type { DbsAutoSendStatus } from '../../api/dbsAutoSend';
import type { ApiResult } from '../../api/http';
import { describeVerdict } from './dbsVerdict';

function status(patch: Partial<DbsAutoSendStatus>): DbsAutoSendStatus {
    return {
        isEnabled: false,
        isAllowedInThisEnvironment: true,
        isActive: false,
        packNos: '',
        packNoList: [],
        delayMinutes: 5,
        maxDelayMinutes: 30,
        sweepMinutes: 15,
        batchSize: 20,
        maxDocumentsPerCompany: 200,
        requestDelayMs: 300,
        queuePackNo: 500000,
        sinceDateUtc: '2026-09-28T21:00:00.0000000Z',
        testPackUserEmails: '',
        hasIntegratorConfig: false,
        isSendJobRegistered: false,
        isSweepJobRegistered: false,
        sendJobLastExecutionUtc: null,
        sendJobNextExecutionUtc: null,
        queueName: 'dbsauto',
        ...patch,
    };
}

function failure(httpStatus: number, error = ''): ApiResult<DbsAutoSendStatus> {
    return { isSuccess: false, status: httpStatus, content: '', data: null, error };
}

describe('DBS otomatik gönderim kararı', () => {
    it('iş çalışıyorsa açık der', () => {
        expect(describeVerdict(status({ isEnabled: true, isActive: true })).kind).toBe('active');
    });

    it('sunucu anahtarı kapalıysa "hiçbir şey gönderilmiyor" der', () => {
        const verdict = describeVerdict(status({ isEnabled: false, isActive: false }));

        expect(verdict.kind).toBe('disabled');
        // Canlıdaki şikâyetin sebebi buydu: firma ayarı "Evet" ama sunucu kapalı.
        expect(verdict.detail).toContain('Evet');
    });

    it('yapılandırmada açık ama ortam izin vermiyorsa ayrı bir durum', () => {
        const verdict = describeVerdict(
            status({ isEnabled: true, isAllowedInThisEnvironment: false, isActive: false }),
        );

        expect(verdict.kind).toBe('blocked');
    });
});

describe('hata metni', () => {
    it('404 iki olasılığı da söyler — anahtar eksik ya da uç yayında değil', () => {
        const text = describeDbsStatusFailure(failure(404));

        expect(text).toContain('Servis anahtarı'.toLowerCase().slice(0, 6));
        expect(text).toContain('yayını bekleniyor');
    });

    it('ağ hatasında ham mesaj gösterilir', () => {
        expect(describeDbsStatusFailure(failure(0, 'Failed to fetch'))).toBe('Failed to fetch');
    });

    it('başka durum kodunda kod yazılır', () => {
        expect(describeDbsStatusFailure(failure(500))).toContain('500');
    });
});
