/**
 * Header component.
 *
 * @param {Object} params
 * @param {string} params.title - The main title text.
 * @param {string} [params.subtitle] - Optional subtitle text.
 * @param {string} [params.className] - Additional CSS classes.
 * @returns {string} The HTML for the header.
 */
export function Header({ title, subtitle = '', className = '' } = {}) {
    return `
      <header class="bg-blue-600 dark:bg-blue-800 shadow-md ${className}">
        <div class="container mx-auto px-4 py-4">
          <h1 class="text-3xl font-bold text-white animate-fadeIn">${title}</h1>
          ${subtitle ? `<p class="text-white">${subtitle}</p>` : ''}
        </div>
      </header>
    `;
  }
  
  /* --- Atomic components for Demo Items --- */
  
  /**
   * Renders the decorative background shapes for a demo item.
   *
   * @param {Object} gradients
   * @param {string} gradients.bgShape1 - CSS classes for the first background shape.
   * @param {string} gradients.bgShape2 - CSS classes for the second background shape.
   * @returns {string} The HTML for the background shapes.
   */
  export function DemoBackground({ bgShape1, bgShape2 }) {
    return `
      <div class="absolute -top-8 -left-8 w-32 h-32 ${bgShape1} rounded-full mix-blend-multiply filter blur-3xl opacity-50"></div>
      <div class="absolute -bottom-8 -right-8 w-40 h-40 ${bgShape2} rounded-full mix-blend-multiply filter blur-3xl opacity-50"></div>
    `;
  }
  
  /**
   * Renders the header area of a demo item (icon, title, and subtitle).
   *
   * @param {Object} params
   * @param {string} params.icon - The icon (emoji or character).
   * @param {string} params.title - The demo title.
   * @param {string} params.subtitle - The demo subtitle.
   * @returns {string} The HTML for the demo header.
   */
  export function DemoHeader({ icon, title, subtitle }) {
    return `
      <div class="flex items-center">
        <div class="w-12 h-12 flex items-center justify-center bg-white dark:bg-gray-800 rounded-full shadow-lg mr-4">
          <span class="text-2xl">${icon}</span>
        </div>
        <div>
          <h3 class="text-2xl font-extrabold text-gray-800 dark:text-gray-100">${title}</h3>
          <span class="text-sm text-gray-600 dark:text-gray-400">${subtitle}</span>
        </div>
      </div>
    `;
  }
  
  /**
   * Renders the description of a demo item.
   *
   * @param {string} description - The demo description.
   * @returns {string} The HTML for the description.
   */
  export function DemoDescription(description) {
    return `<p class="text-gray-700 dark:text-gray-300">${description}</p>`;
  }
  
  /**
   * Renders the highlights section of a demo item.
   *
   * @param {string} highlights - The highlight text.
   * @returns {string} The HTML for the highlights.
   */
  export function DemoHighlights(highlights) {
    return `
      <div class="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-md">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          <strong>Highlights:</strong> ${highlights}
        </p>
      </div>
    `;
  }
  
  /**
   * Renders the actions (button and link) for a demo item.
   *
   * @param {Object} params
   * @param {string} params.launchButtonText - The text for the launch button.
   * @param {string} params.learnMoreText - The text for the learn more link.
   * @param {string} params.learnMoreHref - The URL for the learn more link.
   * @param {Object} gradients
   * @param {string} gradients.buttonGradient - CSS classes for the button background.
   * @param {string} gradients.linkColor - CSS classes for the link text color.
   * @returns {string} The HTML for the actions.
   */
  export function DemoActions({ launchButtonText, learnMoreText, learnMoreHref }, { buttonGradient, linkColor }) {
    return `
      <div class="flex items-center justify-between">
        <button class="px-6 py-2 ${buttonGradient} text-white font-semibold rounded-full shadow-md hover:transition transform hover:scale-105">
          ${launchButtonText}
        </button>
        <a href="${learnMoreHref}" class="text-sm font-medium ${linkColor} hover:underline">
          ${learnMoreText}
        </a>
      </div>
    `;
  }
  
  /**
   * Composes a single demo item from its atomic parts.
   *
   * @param {Object} demo - The demo data.
   * @param {string} demo.icon - The icon.
   * @param {string} demo.title - The title.
   * @param {string} demo.subtitle - The subtitle.
   * @param {string} demo.description - The description.
   * @param {string} demo.highlights - The highlights text.
   * @param {string} demo.launchButtonText - The launch button text.
   * @param {string} demo.learnMoreText - The learn more text.
   * @param {string} demo.learnMoreHref - The learn more link URL.
   * @param {Object} demo.gradients - The gradient and background classes.
   * @param {string} demo.gradients.container - CSS classes for the item container.
   * @param {string} demo.gradients.bgShape1 - CSS classes for the first background shape.
   * @param {string} demo.gradients.bgShape2 - CSS classes for the second background shape.
   * @param {string} demo.gradients.buttonGradient - CSS classes for the button background.
   * @param {string} demo.gradients.linkColor - CSS classes for the link color.
   * @returns {string} The HTML for a single demo item.
   */
  export function DemoItem(demo) {
    return `
      <li class="relative p-4 ${demo.gradients.container} rounded-2xl shadow-2xl overflow-hidden transform transition duration-300 hover:scale-105 hover:shadow-3xl">
        ${DemoBackground({ bgShape1: demo.gradients.bgShape1, bgShape2: demo.gradients.bgShape2 })}
        <div class="relative z-10 flex flex-col space-y-4">
          ${DemoHeader({ icon: demo.icon, title: demo.title, subtitle: demo.subtitle })}
          ${DemoDescription(demo.description)}
          ${DemoHighlights(demo.highlights)}
          ${DemoActions(
            { launchButtonText: demo.launchButtonText, learnMoreText: demo.learnMoreText, learnMoreHref: demo.learnMoreHref },
            { buttonGradient: demo.gradients.buttonGradient, linkColor: demo.gradients.linkColor }
          )}
        </div>
      </li>
    `;
  }
  
  /**
   * Composes a list of demo items.
   *
   * @param {Array<Object>} demos - An array of demo data objects.
   * @returns {string} The HTML for the demo list.
   */
  export function DemoList(demos) {
    const items = demos.map(demo => DemoItem(demo)).join('');
    return `<ul class="space-y-6 p-4">${items}</ul>`;
  }
  
  /**
   * Aside component that renders the demos section.
   *
   * @param {Object} params
   * @param {Array<Object>} params.demos - An array of demo data objects.
   * @param {string} [params.asideClass] - Additional CSS classes.
   * @returns {string} The HTML for the aside.
   */
  export function Aside({ demos, asideClass = '' } = {}) {
    return `
      <aside class="lg:w-1/3 bg-white dark:bg-gray-800 rounded-lg shadow-md h-[70vh] overflow-y-auto ${asideClass}">
        <div class="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 class="text-xl font-semibold">Demos</h2>
        </div>
        ${DemoList(demos)}
      </aside>
    `;
  }
  
  /* --- Other page components --- */
  
  /**
   * Canvas component (server-rendered; no interactive behavior attached).
   *
   * @param {Object} params
   * @param {string} params.headerText - Header text for the canvas.
   * @param {number|string} [params.clickCount=0] - Initial click count.
   * @param {string} [params.sectionClass] - Additional CSS classes.
   * @returns {string} The HTML for the canvas.
   */
  export function Canvas({ headerText, clickCount = 0, sectionClass = '' } = {}) {
    return `
      <section class="lg:w-2/3 bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 h-[70vh] flex flex-col ${sectionClass}">
        <h2 class="text-2xl font-semibold mb-4 flex-shrink-0">${headerText}</h2>
        <div class="flex-grow flex items-center justify-center">
          <div id="clicker" class="flex flex-col items-center justify-center">
            <p id="clickCount" class="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-4">${clickCount}</p>
            <button id="clickButton"
              class="px-6 py-3 bg-blue-500 text-white rounded-full shadow-md hover:bg-blue-600 transition transform hover:scale-105">
              Click me!
            </button>
          </div>
        </div>
      </section>
    `;
  }
  
  /**
   * Footer component.
   *
   * @param {Object} params
   * @param {number|string} params.year - The year to display.
   * @param {string} params.copyText - Copyright text.
   * @param {Array<Object>} params.projectLinks - Array of project link objects.
   * @param {string} [params.footerClass] - Additional CSS classes.
   * @returns {string} The HTML for the footer.
   */
  export function Footer({ year, copyText, projectLinks, footerClass = '' } = {}) {
    const links = projectLinks.map(link => `
      <a href="${link.href}" class="flex items-center text-blue-600 dark:text-blue-400 hover:underline">
        <span class="mr-1">${link.icon}</span> ${link.text}
      </a>
    `).join('');
    
    return `
      <footer class="bg-gray-200 dark:bg-gray-800 border-t border-gray-300 dark:border-gray-700 ${footerClass}">
        <div class="container mx-auto px-4 py-4 flex flex-col lg:flex-row justify-between items-center">
          <p class="text-sm">&copy; ${year} ${copyText}</p>
          <div class="flex space-x-4 mt-2 lg:mt-0">${links}</div>
        </div>
      </footer>
    `;
  }
  
  /* --- Example Composition of the Full Page --- */
  
  // Example demo data for the Aside component.
  const demos = [
    {
      icon: '🚀',
      title: 'Demo 1',
      subtitle: 'Interactive Module',
      description: 'Explore innovative features with cutting-edge animations and a responsive design.',
      highlights: 'Smooth animations and advanced interactions.',
      launchButtonText: 'Launch',
      learnMoreText: 'Learn More',
      learnMoreHref: '#',
      gradients: {
        container: 'bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900',
        bgShape1: 'bg-purple-300 dark:bg-purple-700',
        bgShape2: 'bg-blue-300 dark:bg-blue-700',
        buttonGradient: 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600',
        linkColor: 'text-blue-500 dark:text-blue-400'
      }
    },
    // Additional demo objects can be added here.
  ];
  
  // Compose the full HTML document.
  const fullHTML = `
  <!DOCTYPE html>
  <html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HTMleX playgrounds</title>
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      /* Hide scrollbar for Chrome, Safari and Opera */
      .hide-scrollbar::-webkit-scrollbar { display: none; }
      /* Hide scrollbar for IE, Edge and Firefox */
      .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
    </style>
  </head>
  <body class="bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-sans antialiased min-h-screen flex flex-col">
    ${Header({ title: 'HTMleX playgrounds' })}
    <main class="container mx-auto px-4 py-6 flex-1 flex flex-col lg:flex-row gap-6">
      ${Aside({ demos })}
      ${Canvas({ headerText: 'Canvas', clickCount: 0 })}
    </main>
    ${Footer({
      year: 2025,
      copyText: 'HTMleX playgrounds',
      projectLinks: [
        { icon: '🔗', text: 'Project Link 1', href: '#' },
        { icon: '📎', text: 'Project Link 2', href: '#' },
        { icon: '💻', text: 'Project Link 3', href: '#' }
      ]
    })}
  </body>
  </html>
  `;
  
  export default fullHTML;
  