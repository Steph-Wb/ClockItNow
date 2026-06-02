import { useTranslation } from 'react-i18next';
import { changeLanguage, SUPPORTED_LANGUAGES, type LangCode } from '../../i18n';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  return (
    <div className="flex rounded-lg overflow-hidden border border-border w-fit">
      {SUPPORTED_LANGUAGES.map(({ code, label }) => (
        <button
          key={code}
          onClick={() => changeLanguage(code as LangCode)}
          className={`px-3 py-1.5 text-sm transition-colors ${
            i18n.language === code
              ? 'bg-accent/10 text-accent font-medium'
              : 'text-secondary hover:text-primary'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
