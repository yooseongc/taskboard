import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ko from './ko.json';
import en from './en.json';

const savedLocale = localStorage.getItem('taskboard_locale') ?? 'ko';

i18n.use(initReactI18next).init({
  resources: { ko: { translation: ko }, en: { translation: en } },
  lng: savedLocale,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
