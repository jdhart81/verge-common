# Installable web app

Visit `/app/` for the community entry point and installation instructions. The manifest opens `/network/` in standalone mode on supported browsers. Mobile navigation links discovery, signed-in co-ops and app help. The same account, membership and private-record rules apply in standalone mode.

The browser controls whether and when installation is offered. The Install button appears only after its installability event; other platforms have manual menu instructions. See [MDN installation guidance](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable). This is not an App Store or Play Store release.

The service worker passes requests through to the network and provides a generic offline document only for top-level app navigation failures. It never caches pages, API data or evidence and never queues writes. It does not intercept authentication routes or API/file downloads. Already visible state and the existing device-local demo are not erased by this mechanism. Offline editing, background sync and push notifications are not implemented.

Registration is skipped on localhost to avoid persistent development workers. To test installation use an HTTPS staging host with the intended audience. The manifest retains credentialed fetching for authenticated hosting compatibility. The live homepage and discovery are public; account and membership checks protect private co-op records. Verify installation and sign-in with the intended accounts and devices before expanding the pilot.

Validation: automated service-worker request-boundary tests, application tests, type checking, production build and HTTP asset/route checks. Real-device installation, standalone sign-in and mobile accessibility need manual acceptance testing. No successful phone installation is claimed from build or HTTP checks alone.

## Native participation candidate

The `ios/` directory contains a SwiftUI iPhone/iPad companion with public discovery, personal-device tokens, authenticated co-op views, member posts and explicit field-draft submission to reviewed parcels. It retains local field notes, versioned JSON export and the deployed website importer. Import alone does not submit or approve an observation. Place labels do not establish parcel identity; review the selected parcel before saving. CI passed native tests and an unsigned simulator build. See [native build and release checklist](../ios/README.md). Physical-device acceptance, signing and TestFlight/App Store distribution remain outstanding.
