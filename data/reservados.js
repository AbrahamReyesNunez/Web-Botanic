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
    refrescosPorBotella: 10   // incluidos con cada botella (no con chupitos ni champán)
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

  refrescos: [
    { nombre: "Coca-Cola", alias: ["cocacola", "pepsi", "cola"] },
    { nombre: "Coca-Cola Zero", alias: ["cocacola", "pepsi zero", "pepsi max", "coca light", "light"] },
    { nombre: "Fanta naranja", alias: ["kas naranja", "kas"] },
    { nombre: "Fanta limón", alias: ["kas limon", "kas"] },
    { nombre: "Tónica", alias: ["schweppes"] },
    { nombre: "Tónica fresa", alias: ["schweppes"] },
    { nombre: "Tónica limón", alias: ["schweppes"] },
    { nombre: "Sprite", alias: ["seven up", "7up", "7 up", "gaseosa", "limon"] },
    { nombre: "Power King", suplemento: 5, alias: ["red bull", "redbull", "monster", "burn", "energetica"] },
    { nombre: "Zumo de piña", alias: ["jugo"] },
    { nombre: "Zumo de melocotón", alias: ["jugo"] },
    { nombre: "Agua", alias: ["agua mineral"] }
  ]
};
