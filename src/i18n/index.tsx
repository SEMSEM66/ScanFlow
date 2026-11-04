import React, { createContext, useContext, useState, useMemo } from 'react';
import { de } from './de';
import { en } from './en';
import { LanguageMode } from '../types';

type Translations = typeof de;

interface I18nContextValue {
  language: LanguageMode;
  t: Translations;
  setLanguage: (lang: LanguageMode) => void;
  formatString: (template: string, vars: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<LanguageMode>('de'); // German default as specified

  const t = useMemo(() => (language === 'de' ? de : en), [language]);

  const formatString = (template: string, vars: Record<string, string | number>): string => {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }
    return result;
  };

  const value = useMemo(
    () => ({
      language,
      t,
      setLanguage,
      formatString,
    }),
    [language, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useTranslation = (): I18nContextValue => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
};
