# Installable web app

Visit `/app/` for the community entry point and installation instructions. The manifest opens `/network/` in standalone mode on supported browsers. Mobile navigation links discovery, signed-in co-ops and app help. Existing identity and hosting access restrictions apply in standalone mode as well.

The browser controls whether and when installation is offered. The Install button appears only after its installability event; other platforms have manual menu instructions. See [MDN installation guidance](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable). This is not an App Store or Play Store release.

The service worker passes requests through to the network and provides a generic offline document only for top-level app navigation failures. It never caches pages, API data or evidence and never queues writes. It does not intercept authentication routes or API/file downloads. Already visible state and the existing device-local demo are not erased by this mechanism. Offline editing, background sync and push notifications are not implemented.

Registration is skipped on localhost to avoid persistent development workers. To test installation use an HTTPS staging host with the intended audience. The manifest uses credentialed fetching because the current hosted site is private. Host-level access checks may still affect browser installation; verify with the intended accounts and devices before public launch.

Validation: automated service-worker request-boundary tests, application tests, type checking, production build and HTTP asset/route checks. Real-device installation, standalone sign-in and mobile accessibility need manual acceptance testing. No successful phone installation is claimed from build or HTTP checks alone.

## Native field-journal candidate

The `ios/` directory now contains a SwiftUI iPhone/iPad companion and native draft tests. It supports local field notes and versioned JSON export. Monitoring's field-visit form can load an export without automatically submitting it. Place labels do not establish parcel identity; review the selected parcel before saving. See [native build and release checklist](../ios/README.md). This candidate is not uploaded to TestFlight. Its website importer must be deployed before use against the hosted pilot.
