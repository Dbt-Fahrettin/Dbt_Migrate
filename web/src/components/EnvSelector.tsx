import type { EnvKey, ServiceEnvironment } from '../config/environments';
import { visibleEnvironments } from '../config/environments';
import { isNativeApp } from '../config/platform';
import { ENV_ACCENT } from './envAccent';

interface Props {
    value: EnvKey;
    onChange: (key: EnvKey) => void;
    disabled?: boolean;
    /** Capacitor paketinde localhost'a erişilemediği için Local gizlenir. */
    environments?: ServiceEnvironment[];
}

export function EnvSelector({ value, onChange, disabled, environments = visibleEnvironments(isNativeApp()) }: Props) {
    return (
        <div
            role="radiogroup"
            aria-label="Ortam"
            className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
        >
            {environments.map((env) => {
                const isSelected = env.key === value;
                const accent = ENV_ACCENT[env.key];

                return (
                    <button
                        key={env.key}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        disabled={disabled}
                        onClick={() => onChange(env.key)}
                        className={[
                            'rounded-lg px-3 py-2 text-sm font-semibold transition',
                            'focus-visible:outline-2 focus-visible:outline-offset-2',
                            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                            isSelected
                                ? accent.chip
                                : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700',
                        ].join(' ')}
                    >
                        {env.name}
                    </button>
                );
            })}
        </div>
    );
}
