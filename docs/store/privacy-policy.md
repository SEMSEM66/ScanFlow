# Datenschutzerklärung für ScanFlow (Privacy Policy)

**Stand:** November 2026  
**App:** ScanFlow (iOS)  
**Entwickler:** SemSem

---

## 1. Präambel & Grundsatz: 100% Offline, Zero Tracking

ScanFlow wurde nach dem Grundsatz **"Privacy First"** entwickelt:
- **Keine Server:** ScanFlow betreibt keine eigenen Server und nutzt keine Server von Drittanbietern.
- **Keine Benutzerkonten:** Zur Nutzung von ScanFlow ist keine Registrierung, kein Login und keine Angabe persönlicher Daten erforderlich.
- **Keine Werbenetzwerke & keine Tracker:** In ScanFlow sind keinerlei Werbe- oder Analyse-SDKs eingebunden (weder Google Analytics, Firebase, Amplitude, Mixpanel noch Sentry).
- **Keine Telemetrie:** Es werden keine Nutzungs- oder Absturzdaten vom Gerät übertragen.

Alle Verarbeitungen – einschließlich Dokumentenerkennung, Filterung, Texterkennung (Apple Vision OCR), Word-Konvertierung, PDF-Verschlüsselung und Backup-Erstellung – finden **ausschließlich lokal auf Ihrem iPhone** statt.

---

## 2. Erfassung und Verarbeitung von Daten

### a) Dokumente, Scans und Texterkennung
Alle gescannten Seiten, importierten Fotos, PDFs und durch Texterkennung extrahierten Texte verbleiben vollständig in der isolierten Sandbox-Umgebung der App auf Ihrem Gerät (`expo-sqlite` Datenbank und geschütztes Dateisystem). 

### b) Kamera & Fotomediathek
- **Kamerazugriff (`NSCameraUsageDescription`):** Wird ausschließlich zur optischen Erfassung von Dokumenten genutzt.
- **Fotomediathek (`NSPhotoLibraryUsageDescription`):** Wird ausschließlich dann genutzt, wenn Sie über den Dateiauswahldialog manuell Bilder zum Scannen oder Konvertieren auswählen.

### c) App-Sperre & Biometrie
- ScanFlow nutzt das native Apple-Framework `LocalAuthentication` für Face ID und Touch ID. ScanFlow hat zu keinem Zeitpunkt Zugriff auf Ihre biometrischen Rohdaten.
- Ein optionaler ScanFlow-Sicherheitscode (PIN) wird mit dem kryptografischen Standardverfahren PBKDF2-HMAC-SHA256 (5.000 Runden, individuelles 16-Byte-Salt) gehasht und im geschützten iOS-Schlüsselbund (Keychain, *This Device Only*) abgelegt.

### d) In-App-Käufe & Abonnements (StoreKit 2)
In-App-Käufe und Abonnements für ScanFlow Pro werden direkt über Apples native StoreKit 2 Programmierschnittstelle mit Apple abgewickelt. ScanFlow speichert keine Kreditkartendaten oder Zahlungsinformationen. Zur Freischaltung von Pro-Funktionen wird lediglich der von Apple digital signierte Berechtigungsnachweis (JWS) auf dem Gerät validiert und offline im sicheren Geräteschlüsselbund zwischengespeichert.

---

## 3. Datenweitergabe an Dritte

Es findet **keine Weitergabe** von Daten an Dritte statt. Ein Export von Dokumenten (z.B. als PDF, Word oder ZIP) erfolgt ausschließlich durch eine von Ihnen aktiv ausgelöste Aktion über das systemweite iOS-Freigabemenü (*Share Sheet*). Temporäre Exportdateien werden nach Schließen des Freigabemenüs unverzüglich gelöscht.

---

## 4. Ihre Rechte (DSGVO)

Da ScanFlow keine personenbezogenen Daten auf externen Servern verarbeitet oder speichert, befinden sich sämtliche Daten ausschließlich unter Ihrer direkten physischen Kontrolle auf Ihrem Gerät. Sie können alle Dokumente und Einstellungen jederzeit unmittelbar in der App oder durch Deinstallation der App rückstandslos löschen.

---

## 5. Kontakt

Bei Fragen zum Datenschutz erreichen Sie uns unter:  
**E-Mail:** support@scanflow.app
