// Theme toggle, mobile menu, copy buttons and the "on this page" highlight. Everything is optional: the site works without it.
(function () {
  var root = document.documentElement;

  var themeButton = document.querySelector('.themetoggle');
  if (themeButton) {
    themeButton.addEventListener('click', function () {
      var dark = root.dataset.theme === 'dark' || (root.dataset.theme !== 'light' && !window.matchMedia('(prefers-color-scheme: light)').matches);
      var next = dark ? 'light' : 'dark';
      root.dataset.theme = next;
      try {
        localStorage.setItem('victoria-theme', next);
      } catch (e) {
        /* storage blocked: the choice lasts for this page only */
      }
    });
  }

  var navButton = document.querySelector('.navtoggle');
  var sidebar = document.getElementById('sidebar');
  if (navButton && sidebar) {
    navButton.addEventListener('click', function () {
      var open = sidebar.classList.toggle('is-open');
      navButton.setAttribute('aria-expanded', String(open));
    });
  }

  document.querySelectorAll('pre').forEach(function (pre) {
    if (!navigator.clipboard) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy';
    button.textContent = 'Copiar';
    button.addEventListener('click', function () {
      var code = pre.querySelector('code');
      navigator.clipboard.writeText(code ? code.textContent : pre.textContent).then(function () {
        button.textContent = 'Copiado';
        setTimeout(function () {
          button.textContent = 'Copiar';
        }, 1500);
      });
    });
    pre.appendChild(button);
  });

  var links = document.querySelectorAll('.toc a');
  if (links.length && 'IntersectionObserver' in window) {
    var byId = {};
    links.forEach(function (a) {
      byId[a.getAttribute('href').slice(1)] = a;
    });
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          links.forEach(function (a) {
            a.classList.remove('is-current');
          });
          var link = byId[entry.target.id];
          if (link) link.classList.add('is-current');
        });
      },
      { rootMargin: '-72px 0px -70% 0px' },
    );
    document.querySelectorAll('.prose h2[id]').forEach(function (h) {
      observer.observe(h);
    });
  }
})();
