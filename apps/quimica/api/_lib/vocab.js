// Vocabulários fechados do contrato do NLU (docs/DATA_CONTRACT.md §8). Espelham o site (web/src/quimica/js/nlu.js) e o app
// Android. Qualquer valor fora destes conjuntos é descartado: a nuvem nunca fornece fatos.
//
// ATENÇÃO: as listas ABAIXO marcadas com [paridade] são conferidas por backend/modal/test_nlu_core.py contra backend/modal/nlu_core.py
// (o modelo é treinado e restringido pela gramática com os MESMOS valores). Mantenha o formato `export const NOME = Object.freeze([...])`
// com um valor entre aspas simples por item, sem comentários dentro da lista.

/** [paridade] Intenções do contrato (§8), na ordem do contrato. */
export const INTENTS = Object.freeze([
  'ELEMENTO',
  'COMPOSTO',
  'PROPRIEDADE',
  'MASSA_MOLAR',
  'BALANCEAR',
  'ESTEQUIOMETRIA',
  'CONCENTRACAO',
  'PH',
  'GAS_IDEAL',
  'CONVERSAO_UNIDADE',
  'NOMENCLATURA',
  'DESENHAR',
  'COMPARAR',
  'TABELA_PERIODICA',
  'SEGURANCA',
  'CONCEITO',
  'RECUSA_PERIGO',
  'SOBRE_DADOS',
  'FONTES',
  'AJUDA',
  'DESCONHECIDA',
]);
export const INTENT_SET = new Set(INTENTS);

/** Intenções que nunca levam entidades (a resposta não depende delas). */
export const INTENTS_SEM_ENTIDADES = new Set(['RECUSA_PERIGO', 'SOBRE_DADOS', 'FONTES', 'AJUDA', 'DESCONHECIDA']);

/** [paridade] Níveis de explicação. */
export const NIVEIS = Object.freeze(['fundamental', 'medio', 'superior']);
export const NIVEL_SET = new Set(NIVEIS);

/** [paridade] Símbolos dos 118 elementos, em ordem de número atômico. */
export const SIMBOLOS = Object.freeze([
  'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne',
  'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca',
  'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn',
  'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr',
  'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn',
  'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd',
  'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb',
  'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg',
  'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac', 'Th',
  'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm',
  'Md', 'No', 'Lr', 'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds',
  'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og',
]);
export const SIMBOLO_SET = new Set(SIMBOLOS);

/** Nomes (SBQ/IUPAC-PT, inglês) por símbolo, usados só para ancorar `elemento` no texto da pergunta. */
export const NOMES_ELEMENTOS = Object.freeze({
  H: ['Hidrogênio', 'Hydrogen'], He: ['Hélio', 'Helium'], Li: ['Lítio', 'Lithium'], Be: ['Berílio', 'Beryllium'],
  B: ['Boro', 'Boron'], C: ['Carbono', 'Carbon'], N: ['Nitrogênio', 'Nitrogen'], O: ['Oxigênio', 'Oxygen'],
  F: ['Flúor', 'Fluorine'], Ne: ['Neônio', 'Neon'], Na: ['Sódio', 'Sodium'], Mg: ['Magnésio', 'Magnesium'],
  Al: ['Alumínio', 'Aluminium', 'Aluminum'], Si: ['Silício', 'Silicon'], P: ['Fósforo', 'Phosphorus'],
  S: ['Enxofre', 'Sulfur', 'Sulphur'], Cl: ['Cloro', 'Chlorine'], Ar: ['Argônio', 'Argon'], K: ['Potássio', 'Potassium'],
  Ca: ['Cálcio', 'Calcium'], Sc: ['Escândio', 'Scandium'], Ti: ['Titânio', 'Titanium'], V: ['Vanádio', 'Vanadium'],
  Cr: ['Cromo', 'Chromium'], Mn: ['Manganês', 'Manganese'], Fe: ['Ferro', 'Iron'], Co: ['Cobalto', 'Cobalt'],
  Ni: ['Níquel', 'Nickel'], Cu: ['Cobre', 'Copper'], Zn: ['Zinco', 'Zinc'], Ga: ['Gálio', 'Gallium'],
  Ge: ['Germânio', 'Germanium'], As: ['Arsênio', 'Arsenic'], Se: ['Selênio', 'Selenium'], Br: ['Bromo', 'Bromine'],
  Kr: ['Criptônio', 'Krypton'], Rb: ['Rubídio', 'Rubidium'], Sr: ['Estrôncio', 'Strontium'], Y: ['Ítrio', 'Yttrium'],
  Zr: ['Zircônio', 'Zirconium'], Nb: ['Nióbio', 'Niobium'], Mo: ['Molibdênio', 'Molybdenum'], Tc: ['Tecnécio', 'Technetium'],
  Ru: ['Rutênio', 'Ruthenium'], Rh: ['Ródio', 'Rhodium'], Pd: ['Paládio', 'Palladium'], Ag: ['Prata', 'Silver'],
  Cd: ['Cádmio', 'Cadmium'], In: ['Índio', 'Indium'], Sn: ['Estanho', 'Tin'], Sb: ['Antimônio', 'Antimony'],
  Te: ['Telúrio', 'Tellurium'], I: ['Iodo', 'Iodine'], Xe: ['Xenônio', 'Xenon'], Cs: ['Césio', 'Cesium', 'Caesium'],
  Ba: ['Bário', 'Barium'], La: ['Lantânio', 'Lanthanum'], Ce: ['Cério', 'Cerium'], Pr: ['Praseodímio', 'Praseodymium'],
  Nd: ['Neodímio', 'Neodymium'], Pm: ['Promécio', 'Promethium'], Sm: ['Samário', 'Samarium'], Eu: ['Európio', 'Europium'],
  Gd: ['Gadolínio', 'Gadolinium'], Tb: ['Térbio', 'Terbium'], Dy: ['Disprósio', 'Dysprosium'], Ho: ['Hólmio', 'Holmium'],
  Er: ['Érbio', 'Erbium'], Tm: ['Túlio', 'Thulium'], Yb: ['Itérbio', 'Ytterbium'], Lu: ['Lutécio', 'Lutetium'],
  Hf: ['Háfnio', 'Hafnium'], Ta: ['Tântalo', 'Tantalum'], W: ['Tungstênio', 'Tungsten'], Re: ['Rênio', 'Rhenium'],
  Os: ['Ósmio', 'Osmium'], Ir: ['Irídio', 'Iridium'], Pt: ['Platina', 'Platinum'], Au: ['Ouro', 'Gold'],
  Hg: ['Mercúrio', 'Mercury'], Tl: ['Tálio', 'Thallium'], Pb: ['Chumbo', 'Lead'], Bi: ['Bismuto', 'Bismuth'],
  Po: ['Polônio', 'Polonium'], At: ['Astato', 'Astatine'], Rn: ['Radônio', 'Radon'], Fr: ['Frâncio', 'Francium'],
  Ra: ['Rádio', 'Radium'], Ac: ['Actínio', 'Actinium'], Th: ['Tório', 'Thorium'], Pa: ['Protactínio', 'Protactinium'],
  U: ['Urânio', 'Uranium'], Np: ['Netúnio', 'Neptunium'], Pu: ['Plutônio', 'Plutonium'], Am: ['Amerício', 'Americium'],
  Cm: ['Cúrio', 'Curium'], Bk: ['Berquélio', 'Berkelium'], Cf: ['Califórnio', 'Californium'], Es: ['Einstênio', 'Einsteinium'],
  Fm: ['Férmio', 'Fermium'], Md: ['Mendelévio', 'Mendelevium'], No: ['Nobélio', 'Nobelium'], Lr: ['Laurêncio', 'Lawrencium'],
  Rf: ['Rutherfórdio', 'Rutherfordium'], Db: ['Dúbnio', 'Dubnium'], Sg: ['Seabórgio', 'Seaborgium'], Bh: ['Bóhrio', 'Bohrium'],
  Hs: ['Hássio', 'Hassium'], Mt: ['Meitnério', 'Meitnerium'], Ds: ['Darmstádio', 'Darmstadtium'], Rg: ['Roentgênio', 'Roentgenium'],
  Cn: ['Copernício', 'Copernicium'], Nh: ['Nihônio', 'Nihonium'], Fl: ['Fleróvio', 'Flerovium'], Mc: ['Moscóvio', 'Moscovium'],
  Lv: ['Livermório', 'Livermorium'], Ts: ['Tenesso', 'Tennessine'], Og: ['Oganessônio', 'Oganesson'],
});

/** Nomes históricos/latinos aceitos como evidência do elemento (sem acento, minúsculos). */
export const NOMES_ALTERNATIVOS = Object.freeze({
  N: ['azoto'], Na: ['natrio'], K: ['kalium'], Fe: ['ferrum'], Cu: ['cuprum'], Ag: ['argentum'], Au: ['aurum'],
  Sn: ['stannum'], Pb: ['plumbum'], Hg: ['hydrargyrum', 'azougue'], Sb: ['stibium'], W: ['wolframio', 'wolfram'],
  S: ['sulfur'], Al: ['aluminio'], Cs: ['cesio'],
});

/**
 * [paridade] Propriedades (ids). Seguem os campos de `elementos.json` e `compostos/*.json` (docs/DATA_CONTRACT.md §2 e §3) mais
 * algumas propriedades derivadas. Reconciliar com `regras.propriedades` quando o pipeline publicar o arquivo.
 */
export const PROPRIEDADES = Object.freeze([
  'massaAtomica',
  'massaMolar',
  'massaExata',
  'numeroAtomico',
  'grupo',
  'periodo',
  'bloco',
  'categoria',
  'configuracaoEletronica',
  'eletronegatividade',
  'raioAtomicoPm',
  'afinidadeEletronicaKJmol',
  'energiaIonizacaoKJmol',
  'pontoFusaoK',
  'pontoEbulicaoK',
  'densidadeKgm3',
  'estadoPadrao',
  'estadosOxidacao',
  'descoberta',
  'formula',
  'smiles',
  'cas',
  'xlogp',
  'tpsa',
  'doadoresH',
  'aceptoresH',
  'ligacoesRotaveis',
  'carga',
  'pka',
  'solubilidade',
]);
export const PROPRIEDADE_SET = new Set(PROPRIEDADES);

/**
 * Id que o CLIENTE usa (regras.propriedades do app e contracts/nlu_golden_cases.json) quando difere do id do modelo (que é o nome do campo
 * do pacote, com unidade). O modelo é treinado com o id do campo; a resposta do proxy traz o id do cliente. Os dois formatos são aceitos
 * na entrada. Espelhado em backend/modal/nlu_core.py (PROPRIEDADE_CLIENTE); test_nlu_core.py confere.
 */
export const PROPRIEDADE_CLIENTE = Object.freeze({
  pontoFusaoK: 'pontoFusao',
  pontoEbulicaoK: 'pontoEbulicao',
  densidadeKgm3: 'densidade',
  raioAtomicoPm: 'raioAtomico',
  energiaIonizacaoKJmol: 'energiaIonizacao',
  afinidadeEletronicaKJmol: 'afinidadeEletronica',
});

/** Formas de superfície (sem acento, minúsculas) que servem de evidência de cada propriedade na pergunta. */
export const FORMAS_PROPRIEDADE = Object.freeze({
  massaAtomica: ['massa atomica', 'peso atomico', 'massa do atomo'],
  massaMolar: ['massa molar', 'massa molecular', 'peso molecular', 'massa formula', 'massa da molecula', 'massa do mol'],
  massaExata: ['massa exata', 'massa monoisotopica'],
  numeroAtomico: ['numero atomico', 'z do', 'numero de protons'],
  grupo: ['grupo', 'familia'],
  periodo: ['periodo'],
  bloco: ['bloco'],
  categoria: ['categoria', 'classificacao', 'tipo de elemento', 'e um metal', 'e metal', 'e nao metal', 'e semimetal', 'e um gas nobre', 'e halogenio'],
  configuracaoEletronica: ['configuracao eletronica', 'distribuicao eletronica', 'eletrons por camada', 'subnivel'],
  eletronegatividade: ['eletronegatividade', 'eletronegativo'],
  raioAtomicoPm: ['raio atomico', 'raio do atomo', 'tamanho do atomo', 'raio'],
  afinidadeEletronicaKJmol: ['afinidade eletronica'],
  energiaIonizacaoKJmol: ['energia de ionizacao', 'potencial de ionizacao', 'ionizacao'],
  pontoFusaoK: ['ponto de fusao', 'temperatura de fusao', 'funde', 'derrete', 'fusao', 'congela', 'ponto de congelamento'],
  pontoEbulicaoK: ['ponto de ebulicao', 'temperatura de ebulicao', 'ferve', 'ebulicao', 'evapora'],
  densidadeKgm3: ['densidade', 'massa especifica', 'e mais denso', 'pesa mais'],
  estadoPadrao: ['estado fisico', 'estado padrao', 'estado da materia', 'e solido', 'e liquido', 'e gasoso', 'e um gas', 'solido ou liquido', 'liquido ou gasoso', 'estado a temperatura ambiente'],
  estadosOxidacao: ['estado de oxidacao', 'estados de oxidacao', 'numero de oxidacao', 'nox'],
  descoberta: ['descobert', 'descobriu', 'quem descobriu', 'ano de descoberta', 'quando foi descoberto'],
  formula: ['formula molecular', 'formula quimica', 'formula do', 'formula da', 'qual a formula', 'qual e a formula', 'formula de'],
  smiles: ['smiles'],
  cas: ['numero cas', 'cas number', 'registro cas', 'cas do', 'cas da'],
  xlogp: ['xlogp', 'logp', 'coeficiente de particao', 'lipofilicidade'],
  tpsa: ['tpsa', 'area de superficie polar', 'superficie polar'],
  doadoresH: ['doadores de hidrogenio', 'doadores de h', 'doadores de ligacao de hidrogenio'],
  aceptoresH: ['aceptores de hidrogenio', 'aceitadores de hidrogenio', 'aceptores de h', 'aceptores de ligacao de hidrogenio'],
  ligacoesRotaveis: ['ligacoes rotaveis', 'ligacoes giraveis'],
  carga: ['carga do', 'carga da', 'carga formal', 'carga eletrica', 'carga total'],
  pka: ['pka', 'constante de acidez', 'ka do', 'ka da'],
  solubilidade: ['solubilidade', 'soluvel', 'solubiliza', 'dissolve', 'dissolvem', 'dissolver'],
});

/** [paridade] Unidades canônicas aceitas em `quantidades` e `unidadeDestino`. */
export const UNIDADES = Object.freeze([
  'g', 'mg', 'kg', 'u', 'mol', 'mmol', 'L', 'mL', 'dm3', 'm3', 'cm3',
  'mol/L', 'mmol/L', 'g/L', 'mg/L', 'g/mL', 'g/cm3', 'kg/m3', 'g/mol', 'kJ/mol', 'kcal/mol',
  '%', 'ppm', 'K', '°C', '°F', 'atm', 'Pa', 'kPa', 'bar', 'mmHg', 'torr',
  'J', 'kJ', 'cal', 'kcal', 'eV', 'm', 'cm', 'mm', 'nm', 'pm', 'Å', 's', 'min', 'h',
]);
export const UNIDADE_SET = new Set(UNIDADES);

/**
 * Apelidos de cada unidade (sem acento, minúsculos), do mais longo ao mais curto no uso. O "M" maiúsculo (molar) é tratado à parte
 * em ground.js porque, em minúsculas, "m" é metro.
 */
export const APELIDOS_UNIDADE = Object.freeze({
  g: ['g', 'gr', 'grama', 'gramas'],
  mg: ['mg', 'miligrama', 'miligramas'],
  kg: ['kg', 'kgs', 'quilo', 'quilos', 'kilo', 'kilos', 'quilograma', 'quilogramas'],
  u: ['u', 'dalton', 'daltons', 'unidade de massa atomica', 'unidades de massa atomica'],
  mol: ['mol', 'mols', 'mole', 'moles'],
  mmol: ['mmol', 'milimol', 'milimols', 'milimoles'],
  L: ['l', 'litro', 'litros', 'lt'],
  mL: ['ml', 'mililitro', 'mililitros'],
  dm3: ['dm3', 'dm³', 'decimetro cubico', 'decimetros cubicos'],
  m3: ['m3', 'm³', 'metro cubico', 'metros cubicos'],
  cm3: ['cm3', 'cm³', 'cc', 'centimetro cubico', 'centimetros cubicos'],
  'mol/L': ['mol/l', 'mol l-1', 'mol.l-1', 'mol/litro', 'molar', 'molares', 'mols por litro', 'moles por litro', 'mol por litro'],
  'mmol/L': ['mmol/l', 'milimolar', 'milimoles por litro'],
  'g/L': ['g/l', 'gramas por litro', 'grama por litro'],
  'mg/L': ['mg/l', 'miligramas por litro'],
  'g/mL': ['g/ml', 'gramas por mililitro'],
  'g/cm3': ['g/cm3', 'g/cm³', 'g/cc', 'gramas por centimetro cubico'],
  'kg/m3': ['kg/m3', 'kg/m³', 'quilos por metro cubico'],
  'g/mol': ['g/mol', 'gramas por mol', 'g.mol-1', 'g mol-1'],
  'kJ/mol': ['kj/mol', 'quilojoules por mol', 'kj.mol-1'],
  'kcal/mol': ['kcal/mol', 'quilocalorias por mol'],
  '%': ['%', 'por cento', 'porcento', 'percentual'],
  ppm: ['ppm', 'partes por milhao'],
  K: ['k', 'kelvin', 'kelvins'],
  '°C': ['°c', 'ºc', 'oc', 'graus celsius', 'grau celsius', 'celsius', 'graus centigrados', 'graus c', 'grau c'],
  '°F': ['°f', 'ºf', 'fahrenheit', 'graus fahrenheit', 'graus f'],
  atm: ['atm', 'atmosfera', 'atmosferas'],
  Pa: ['pa', 'pascal', 'pascais'],
  kPa: ['kpa', 'quilopascal', 'quilopascais'],
  bar: ['bar', 'bars'],
  mmHg: ['mmhg', 'milimetros de mercurio', 'milimetro de mercurio'],
  torr: ['torr'],
  J: ['j', 'joule', 'joules'],
  kJ: ['kj', 'quilojoule', 'quilojoules'],
  cal: ['cal', 'caloria', 'calorias'],
  kcal: ['kcal', 'quilocaloria', 'quilocalorias'],
  eV: ['ev', 'eletron-volt', 'eletronvolt', 'eletron volt', 'eletrons-volt'],
  m: ['m', 'metro', 'metros'],
  cm: ['cm', 'centimetro', 'centimetros'],
  mm: ['mm', 'milimetro', 'milimetros'],
  nm: ['nm', 'nanometro', 'nanometros'],
  pm: ['pm', 'picometro', 'picometros'],
  'Å': ['angstrom', 'angstroms', 'angstron'],
  s: ['s', 'seg', 'segundo', 'segundos'],
  min: ['min', 'minuto', 'minutos'],
  h: ['h', 'hora', 'horas'],
});

/** Compostos muito comuns: fórmulas e nomes equivalentes (sem acento, minúsculos). Servem só para ancorar `composto`. */
export const COMPOSTOS_COMUNS = Object.freeze([
  { formulas: ['H2O'], nomes: ['agua', 'agua pura', 'agua destilada', 'oxido de hidrogenio', 'water'] },
  { formulas: ['NaCl'], nomes: ['cloreto de sodio', 'sal de cozinha', 'sal comum', 'sal marinho', 'sodium chloride'] },
  { formulas: ['CO2'], nomes: ['dioxido de carbono', 'gas carbonico', 'carbon dioxide'] },
  { formulas: ['CO'], nomes: ['monoxido de carbono', 'carbon monoxide'] },
  { formulas: ['H2SO4'], nomes: ['acido sulfurico', 'sulfuric acid'] },
  { formulas: ['HCl'], nomes: ['acido cloridrico', 'acido muriatico', 'cloreto de hidrogenio', 'hydrochloric acid'] },
  { formulas: ['HNO3'], nomes: ['acido nitrico', 'nitric acid'] },
  { formulas: ['H3PO4'], nomes: ['acido fosforico', 'phosphoric acid'] },
  { formulas: ['HF'], nomes: ['acido fluoridrico', 'fluoreto de hidrogenio'] },
  { formulas: ['HBr'], nomes: ['acido bromidrico'] },
  { formulas: ['H2S'], nomes: ['sulfeto de hidrogenio', 'acido sulfidrico', 'gas sulfidrico'] },
  { formulas: ['NaOH'], nomes: ['hidroxido de sodio', 'soda caustica', 'sodium hydroxide'] },
  { formulas: ['KOH'], nomes: ['hidroxido de potassio', 'potassa caustica'] },
  { formulas: ['Ca(OH)2'], nomes: ['hidroxido de calcio', 'cal hidratada', 'cal extinta'] },
  { formulas: ['Mg(OH)2'], nomes: ['hidroxido de magnesio', 'leite de magnesia'] },
  { formulas: ['NH3'], nomes: ['amonia', 'amoniaco', 'ammonia'] },
  { formulas: ['NH4Cl'], nomes: ['cloreto de amonio', 'sal amoniaco'] },
  { formulas: ['CH4'], nomes: ['metano', 'gas natural', 'methane'] },
  { formulas: ['C2H6'], nomes: ['etano'] },
  { formulas: ['C3H8'], nomes: ['propano'] },
  { formulas: ['C4H10'], nomes: ['butano'] },
  { formulas: ['C2H4'], nomes: ['eteno', 'etileno'] },
  { formulas: ['C2H2'], nomes: ['etino', 'acetileno'] },
  { formulas: ['C6H6'], nomes: ['benzeno', 'benzene'] },
  { formulas: ['C2H5OH', 'C2H6O'], nomes: ['etanol', 'alcool etilico', 'alcool comum', 'ethanol'] },
  { formulas: ['CH3OH', 'CH4O'], nomes: ['metanol', 'alcool metilico', 'methanol'] },
  { formulas: ['CH3COOH', 'C2H4O2'], nomes: ['acido acetico', 'acido etanoico', 'acetic acid'] },
  { formulas: ['C3H6O', 'CH3COCH3'], nomes: ['acetona', 'propanona', 'acetone'] },
  { formulas: ['CH2O'], nomes: ['formaldeido', 'metanal', 'formol'] },
  { formulas: ['C6H12O6'], nomes: ['glicose', 'glucose', 'dextrose'] },
  { formulas: ['C12H22O11'], nomes: ['sacarose', 'acucar', 'acucar de mesa', 'sucrose'] },
  { formulas: ['CaCO3'], nomes: ['carbonato de calcio', 'calcario', 'giz', 'marmore'] },
  { formulas: ['CaO'], nomes: ['oxido de calcio', 'cal virgem'] },
  { formulas: ['NaHCO3'], nomes: ['bicarbonato de sodio', 'hidrogenocarbonato de sodio', 'baking soda'] },
  { formulas: ['Na2CO3'], nomes: ['carbonato de sodio', 'barrilha', 'soda ash'] },
  { formulas: ['H2O2'], nomes: ['peroxido de hidrogenio', 'agua oxigenada', 'hydrogen peroxide'] },
  { formulas: ['O3'], nomes: ['ozonio', 'ozone'] },
  { formulas: ['SO2'], nomes: ['dioxido de enxofre', 'dioxido de sulfur'] },
  { formulas: ['SO3'], nomes: ['trioxido de enxofre'] },
  { formulas: ['NO2'], nomes: ['dioxido de nitrogenio'] },
  { formulas: ['N2O'], nomes: ['oxido nitroso', 'oxido de dinitrogenio', 'gas hilariante'] },
  { formulas: ['KMnO4'], nomes: ['permanganato de potassio'] },
  { formulas: ['AgNO3'], nomes: ['nitrato de prata'] },
  { formulas: ['CuSO4'], nomes: ['sulfato de cobre', 'sulfato de cobre ii'] },
  { formulas: ['FeCl3'], nomes: ['cloreto de ferro iii', 'cloreto ferrico'] },
  { formulas: ['Fe2O3'], nomes: ['oxido de ferro iii', 'hematita', 'ferrugem'] },
  { formulas: ['Al2O3'], nomes: ['oxido de aluminio', 'alumina'] },
  { formulas: ['SiO2'], nomes: ['dioxido de silicio', 'silica', 'quartzo'] },
  { formulas: ['KCl'], nomes: ['cloreto de potassio'] },
  { formulas: ['NaNO3'], nomes: ['nitrato de sodio', 'salitre do chile'] },
  { formulas: ['C9H8O4'], nomes: ['acido acetilsalicilico', 'aspirina', 'aas'] },
  { formulas: ['C8H10N4O2'], nomes: ['cafeina', 'caffeine'] },
  { formulas: ['C10H8'], nomes: ['naftaleno', 'naftalina'] },
]);

export const NIVEIS_FORMAS = Object.freeze({
  fundamental: ['fundamental', 'crianca', 'sexto ano', '6o ano', '7o ano', '8o ano', '9o ano', 'bem simples', 'explicacao simples', 'para leigo'],
  medio: ['ensino medio', 'nivel medio', 'enem', 'vestibular', 'colegio', '1o ano do medio', '2o ano do medio', '3o ano do medio', 'cursinho'],
  superior: ['superior', 'faculdade', 'graduacao', 'universidade', 'universitario', 'quimica geral', 'pos graduacao', 'nivel avancado', 'aprofundado'],
});

export const CLIENTS = new Set(['android', 'web']);
