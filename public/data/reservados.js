/* =========================================================
   RESERVADOS: MESAS EN PISTA Y MESAS VIP
   ---------------------------------------------------------
   Textos de cada tipo de mesa, precios y bebidas que
   aparecen en el buscador del formulario de reserva.

   - Precio de botella según el día (3 = miércoles … 6 = sábado).
     Si se abre otro día (fecha especial), vale el del sábado.
   - categoria      → botón de atajo en el buscador (Ron, Ginebra…).
   - premium: true  → la botella cuesta "premium" € más ese día.
   - alias          → palabras que también la encuentran en el
     buscador (p. ej. quien busca "pepsi" ve la Coca-Cola).
   - suplemento     → se suma una sola vez si hay al menos una
     (el Power King: 5 € tanto si es 1 lata como si son 10).
   - Champán con precio: null → sale "a consultar" y no suma.
   El servidor usa este mismo archivo para recalcular cada reserva:
   el precio que manda el navegador no se tiene en cuenta.
   El número de mesas de cada tipo (aforo) está en Supabase, tabla tipos_mesa.
   ========================================================= */
window.BOTANIC_RESERVADOS = {
  tipos: {
    pista: {
      nombre: "Mesa en pista",
      subtitulo: "En mitad de la fiesta",
      descripcion: "Tu mesa en la pista, rodeada de ambiente. Para grupos que vienen a bailar toda la noche.",
      minBotellas: 1,
      incluye: [
        "Mesa reservada en la pista toda la noche",
        "1 Botella con 10 bebidas incluidas",
        "Hasta 5 personas por botella",
        "Acceso preferente para el grupo"
      ]
    },
    vip: {
      nombre: "Mesa VIP",
      subtitulo: "Sillones y zona privada",
      descripcion: "Reservado apartado de la pista con sillones y la mejor vista de la sala. Para celebrar cumpleaños, despedidas o tu noche a lo grande.",
      minBotellas: 2,
      incluye: [
        "Zona privada con sillones toda la noche",
        "2 Botellas con 20 bebidas incluidas",
        "Hasta 5 personas por botella",
        "Acceso preferente para el grupo"
      ]
    }
  },

  precios: {
    botella: { 3: 50, 4: 60, 5: 70, 6: 80 },
    premium: 20,              // se suma al precio de la botella ese día
    chupito: 50,              // botella de chupito, todos los días
    refrescosPorBotella: 10,  // incluidos con cada botella (no con chupitos ni champán)
    personasPorBotella: 5     // máximo de personas por cada botella de la mesa
  },

  botellas: [
    { nombre: "Ron Barceló", categoria: "Ron" },
    { nombre: "Ron Brugal", categoria: "Ron" },
    { nombre: "Ginebra Puerto de Indias", categoria: "Ginebra", alias: ["gin", "fresa"] },
    { nombre: "Ginebra Seagram's", categoria: "Ginebra", premium: true, alias: ["gin"] },
    { nombre: "Ginebra Beefeater", categoria: "Ginebra", alias: ["gin"] },
    { nombre: "Whisky Red Label", categoria: "Whisky", alias: ["johnnie walker", "jb", "whiskey"] },
    { nombre: "Whisky Black Label", categoria: "Whisky", premium: true, alias: ["johnnie walker", "whiskey"] },
    { nombre: "Whisky Ballantine's", categoria: "Whisky", alias: ["jb", "whiskey"] },
    { nombre: "Absolut Vodka", categoria: "Vodka", alias: ["smirnoff", "eristoff"] },
    { nombre: "Ciroc Vodka", categoria: "Vodka", premium: true },
    { nombre: "Ciroc Coconut", categoria: "Vodka", premium: true, alias: ["coco"] },
    { nombre: "Ciroc Apple", categoria: "Vodka", premium: true, alias: ["manzana"] },
    { nombre: "Ciroc Red Berry", categoria: "Vodka", premium: true, alias: ["frutos rojos"] },
    { nombre: "Ciroc Peach", categoria: "Vodka", premium: true, alias: ["melocoton"] },
    { nombre: "Amaretto Disaronno", categoria: "Licor" }
  ],

  chupitos: [
    { nombre: "Tequila fresa", alias: ["chupito"] },
    { nombre: "Tequila mango", alias: ["chupito"] },
    { nombre: "Tequila melón sandía", alias: ["chupito"] },
    { nombre: "Tequila azul", alias: ["chupito"] }
  ],

  champan: [
    { nombre: "Moët blanco", precio: null, alias: ["moet", "champagne", "cava"] },
    { nombre: "Moët verde", precio: null, alias: ["moet", "champagne", "cava"] }
  ],

  // envase: "botellin" (cristal), "lata" o "agua" (botella de plástico).
  // aspecto: colores del dibujo en el medidor → líquido (o cuerpo de la lata), chapa/tapón y etiqueta
  refrescos: [
    { nombre: "Coca-Cola", envase: "botellin", aspecto: { liquido: "#3a1a0c", chapa: "#e41c23", etiqueta: "#e41c23" }, alias: ["cocacola", "pepsi", "cola"] },
    { nombre: "Coca-Cola Zero", envase: "botellin", aspecto: { liquido: "#3a1a0c", chapa: "#111111", etiqueta: "#111111" }, alias: ["cocacola", "pepsi zero", "pepsi max", "coca light", "light"] },
    { nombre: "Fanta naranja", envase: "botellin", aspecto: { liquido: "#ff8a00", chapa: "#1d5bd8", etiqueta: "#1d5bd8" }, alias: ["kas naranja", "kas"] },
    { nombre: "Fanta limón", envase: "botellin", aspecto: { liquido: "#f2dc3c", chapa: "#1d5bd8", etiqueta: "#2e9b3a" }, alias: ["kas limon", "kas"] },
    { nombre: "Tónica", envase: "botellin", aspecto: { liquido: "#e4f1ec", chapa: "#f2c100", etiqueta: "#f2c100" }, alias: ["schweppes"] },
    { nombre: "Tónica fresa", envase: "botellin", aspecto: { liquido: "#ff7a9a", chapa: "#f2c100", etiqueta: "#d6224f" }, alias: ["schweppes"] },
    { nombre: "Tónica limón", envase: "botellin", aspecto: { liquido: "#f3eaa0", chapa: "#f2c100", etiqueta: "#9bc53d" }, alias: ["schweppes"] },
    { nombre: "Sprite", envase: "botellin", aspecto: { liquido: "#bfe8c4", chapa: "#1f9d4a", etiqueta: "#1f9d4a" }, alias: ["seven up", "7up", "7 up", "gaseosa", "limon"] },
    { nombre: "Power King", suplemento: 5, envase: "lata", aspecto: { liquido: "#1c3fa8", chapa: "#c9ced6", etiqueta: "#e41c23" }, alias: ["red bull", "redbull", "monster", "burn", "energetica"] },
    { nombre: "Zumo de piña", envase: "botellin", aspecto: { liquido: "#f7c948", chapa: "#e8a400", etiqueta: "#2e9b3a" }, alias: ["jugo"] },
    { nombre: "Zumo de melocotón", envase: "botellin", aspecto: { liquido: "#ffa65c", chapa: "#e07a2e", etiqueta: "#e07a2e" }, alias: ["jugo"] },
    { nombre: "Agua", envase: "agua", aspecto: { liquido: "#cdeaff", chapa: "#2b7bd6", etiqueta: "#2b7bd6" }, alias: ["agua mineral"] }
  ]
};
