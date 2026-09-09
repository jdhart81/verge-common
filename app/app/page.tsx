export default function AppHome() {
  return <main className="app-start">
    <a href="/" className="app-wordmark">Verge Common</a>
    <h1>Your community.<br/>A place to care for.</h1>
    <p>Find a conservation co-op or bring your neighbors together around a place that matters.</p>
    <div className="app-start-actions"><a href="/network/">Find a co-op</a><a href="/workspace/">Open or start my co-op</a></div>
    <section aria-labelledby="install-title"><h2 id="install-title">Add Verge to your home screen</h2>
      <p>Open this site in your phone’s browser. If an Install button appears, tap it. You can also use the steps below.</p>
      <details><summary>iPhone or iPad</summary><p>Open in Safari, tap Share, then Add to Home Screen. If offered, turn on Open as Web App and tap Add.</p></details>
      <details><summary>Android</summary><p>Open in Chrome and use the browser menu → Install app or Add to Home screen. The wording depends on your browser.</p></details>
      <details><summary>Desktop</summary><p>In a supported browser such as Chrome or Edge, look for the install icon in the address bar or the browser’s app installation menu.</p></details>
      <p>Installation is optional. Your co-ops work in the browser too. Sign-in and access permissions still apply; an internet connection is required for records and changes.</p>
    </section>
    <section><h2>Start with one shared activity</h2><ol><li>Create a co-op and choose who can see it.</li><li>Add a place or project and invite your neighbors.</li><li>Organize an activity, record what happened, and plan the next one.</li></ol></section>
    <p><a href="https://github.com/jdhart81/verge-common">Run your own community edition or contribute on GitHub ↗</a></p>
  </main>;
}
