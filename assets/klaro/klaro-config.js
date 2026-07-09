// Klaro consent manager configuration for guavo.com
// Docs: https://klaro.org/docs/
(function(){
  window.klaroConfig = {
    version: 1,
    elementID: 'klaro',
    styling: { theme: ['light', 'bottom', 'wide'] },
    noAutoLoad: false,
    htmlTexts: true,
    embedded: false,
    groupByPurpose: true,
    storageMethod: 'cookie',
    cookieName: 'klaro',
    cookieExpiresAfterDays: 180,
    default: false,
    mustConsent: false,
    acceptAll: true,
    hideDeclineAll: false,
    hideLearnMore: false,
    translations: {
      zz: {
        privacyPolicyUrl: '/privacy.html'
      },
      en: {
        consentModal: {
          title: 'Privacy & Cookies',
          description: 'Guavo uses Google Analytics to understand how visitors find and use this site. We do not sell your data, we do not run ads, and no tracking cookies are set unless you accept below. Read the {privacyPolicy} for details.'
        },
        consentNotice: {
          description: 'We use Google Analytics to measure site traffic. Nothing is stored on your device until you consent. See our {privacyPolicy}.',
          learnMore: 'Manage'
        },
        purposes: {
          analytics: {
            title: 'Analytics',
            description: 'Understanding how visitors use guavo.com.'
          }
        },
        ok: 'Accept',
        decline: 'Reject',
        acceptSelected: 'Save choices',
        acceptAll: 'Accept all',
        close: 'Close',
        privacyPolicy: {
          name: 'Privacy Policy',
          text: 'For more information, please read our {privacyPolicy}.'
        },
        purposeItem: { service: 'service', services: 'services' }
      }
    },
    services: [
      {
        name: 'google-analytics',
        title: 'Google Analytics',
        purposes: ['analytics'],
        cookies: [
          [/^_ga/, '/', '.guavo.com'],
          [/^_gid$/, '/', '.guavo.com'],
          [/^_gat/, '/', '.guavo.com']
        ],
        onAccept: "if (typeof gtag === 'function') { gtag('consent', 'update', { 'analytics_storage': 'granted' }); }",
        onDecline: "if (typeof gtag === 'function') { gtag('consent', 'update', { 'analytics_storage': 'denied' }); }"
      }
    ]
  };
})();
