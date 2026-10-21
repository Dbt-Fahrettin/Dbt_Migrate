import { useRef, useState } from 'react';
import { describeError } from '../../api/http';
import {
    describeDbsStatusFailure,
    getDbsAutoSendStatus,
    type DbsAutoSendStatus,
} from '../../api/dbsAutoSend';
import { endpoints } from '../../api/endpoints';
import { isPlausibleServiceKey, loadServiceKey } from '../../api/serviceKey';
import { useAuth } from '../../auth/useAuth';
import { formatDateTime } from '../../format';
import { VERDICT_TONE, describeVerdict } from './dbsVerdict';

/**
 * Otomatik DBS gönderiminin **sunucu anahtarının** durumu.
 *
 * Seçili ortamı sorgular (üstteki ortam seçici): uç servis anahtarı istediği için ortamlar birlikte
 * sorulamaz — anahtar ortam başına ayrı saklanıyor.
 *
 * Açma/kapatma düğmesi bilerek YOK: değer ortam değişkeninden okunuyor, API ile değiştirilemez.
 * Bunun yerine ekran nasıl açılacağını yazıyor. Yanlış bir düğme koymak, basıldığında hiçbir şeyin
 * değişmemesi demekti.
 */

type Phase = 'idle' | 'loading' | 'ok' | 'error';

export function DbsAutoSendPage() {
    const { environment } = useAuth();

    const [phase, setPhase] = useState<Phase>('idle');
    const [status, setStatus] = useState<DbsAutoSendStatus | null>(null);
    const [error, setError] = useState('');
    const [readAt, setReadAt] = useState('');

    const abortRef = useRef<AbortController | null>(null);

    const hasKey = isPlausibleServiceKey(loadServiceKey(environment.apiBaseUrl));
    const url = endpoints.dbsAutoSendStatus(environment.apiBaseUrl);

    async function load(): Promise<void> {
        setPhase('loading');
        setError('');

        const controller = new AbortController();

        abortRef.current = controller;

        try {
            const result = await getDbsAutoSendStatus(environment.apiBaseUrl, controller.signal);

            setReadAt(new Date().toLocaleTimeString('tr-TR'));

            if (!result.isSuccess || !result.data) {
                setStatus(null);
                setError(describeDbsStatusFailure(result));
                setPhase('error');

                return;
            }

            setStatus(result.data);
            setPhase('ok');
        } catch (caught) {
            if (controller.signal.aborted) {
                return;
            }

            setStatus(null);
            setError(describeError(caught));
            setPhase('error');
        }
    }

    return (
        <div className="safe-x safe-bottom mx-auto max-w-4xl pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    <span className="font-medium">{environment.name}</span> ortamındaki sunucu anahtarı
                    (<code>DbsAutoSend__Enabled</code>) ve çalışma ayarları.
                </p>

                <button
                    type="button"
                    onClick={() => void load()}
                    disabled={phase === 'loading'}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                    {phase === 'loading' ? 'Sorgulanıyor…' : 'Durumu sorgula'}
                </button>
            </div>

            {!hasKey && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    Bu ortam için servis anahtarı girilmemiş. Uç anahtarsız istekte <b>404</b> döner —
                    anahtarı Migration İşlemleri ekranındaki <b>Servis anahtarı</b> alanına yapıştırın.
                </p>
            )}

            {phase === 'ok' && status && <StatusCard status={status} />}

            {phase === 'error' && (
                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                    {error}
                </p>
            )}

            <HowToToggle />

            <p className="mt-4 break-all font-mono text-[10px] text-slate-400 dark:text-slate-600">
                {url}
                {readAt && ` · okundu: ${readAt}`}
            </p>
        </div>
    );
}

function StatusCard({ status }: { status: DbsAutoSendStatus }) {
    const verdict = describeVerdict(status);

    return (
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className={`rounded-xl px-4 py-3 ${VERDICT_TONE[verdict.kind]}`}>
                <p className="text-base font-bold">{verdict.title}</p>
                <p className="mt-0.5 text-xs">{verdict.detail}</p>
            </div>

            <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                <Row label="Paketler">
                    {status.packNoList.length === 0
                        ? 'tüm paketler'
                        : status.packNoList.join(', ')}
                </Row>
                <Row label="Kuyruk paketi">{status.queuePackNo}</Row>
                <Row label="Kayıttan sonra bekleme">
                    {status.delayMinutes} dk (en çok {status.maxDelayMinutes} dk)
                </Row>
                <Row label="Telafi taraması">{status.sweepMinutes} dk'da bir</Row>
                <Row label="Tur başına firma">{status.batchSize}</Row>
                <Row label="Firma başına belge">{status.maxDocumentsPerCompany}</Row>
                <Row label="İstekler arası bekleme">{status.requestDelayMs} ms</Row>
                <Row label="Başlangıç tarihi">{formatDateTime(status.sinceDateUtc)}</Row>
                <Row label="Entegratör anahtarı">
                    {status.hasIntegratorConfig ? (
                        'yapılandırmada tanımlı'
                    ) : (
                        <span className="text-amber-700 dark:text-amber-300">
                            yapılandırmada yok — pakete gömülü <code>DbsIntegratorApi</code> sabitine düşer
                        </span>
                    )}
                </Row>
                <Row label="Hangfire kuyruğu">{status.queueName}</Row>
                <Row label="Gönderim işi">
                    {status.isSendJobRegistered ? 'kayıtlı' : 'KAYITLI DEĞİL'}
                </Row>
                <Row label="Telafi işi">
                    {status.isSweepJobRegistered ? 'kayıtlı' : 'KAYITLI DEĞİL'}
                </Row>
                <Row label="İşin son çalışması">
                    {status.sendJobLastExecutionUtc ? formatDateTime(status.sendJobLastExecutionUtc) : '—'}
                </Row>
                <Row label="İşin sıradaki çalışması">
                    {status.sendJobNextExecutionUtc ? formatDateTime(status.sendJobNextExecutionUtc) : '—'}
                </Row>
                <Row label="123'lü paketlerde tetikleyebilen">{status.testPackUserEmails || '—'}</Row>
            </dl>
        </section>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-slate-100 py-1 dark:border-slate-800">
            <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="font-mono text-xs text-slate-900 dark:text-slate-100">{children}</dd>
        </div>
    );
}

function HowToToggle() {
    return (
        <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
            <p className="font-semibold text-slate-900 dark:text-slate-100">Açma / kapatma</p>

            <p className="mt-1">
                Buradan yapılamaz: değer ortam değişkeninden okunuyor. Değiştirmek için und-svc
                manifestindeki <code>DbsAutoSend__Enabled</code> düzenlenip servis yeniden yayınlanır
                (<code>_infrastructure/k8s/deployments/unideva/…/und-svc-*.deployment.yaml</code>).
                Pilot paketle açmak için <code>DbsAutoSend__PackNos</code>, entegratör kimliği için
                <code> DbsAutoSend__IntegratorApiKey</code> / <code>__IntegratorApiSecret</code>.
            </p>

            <p className="mt-2">
                <b>Firma ayarı başka bir şeydir.</b> Kullanıcının masaüstünde gördüğü "kaydettikten sonra
                otomatik gönder" seçeneği paket veritabanında durur ve bu ekranı etkilemez. İkisi birden
                açık olmadan gönderim olmaz.
            </p>
        </section>
    );
}
