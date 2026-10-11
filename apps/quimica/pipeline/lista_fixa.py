# -*- coding: utf-8 -*-
"""
Lista fixa de compostos do ensino médio e de cultura geral (autoria própria).

Formato de cada linha: `Nome em português | termo de busca no PubChem (inglês) | fórmula convencional [| nome popular]`.
Linhas `## classes` definem as classes (ids em snake_case) das linhas seguintes. O CID NÃO é digitado aqui: é resolvido no
PubChem pelo termo de busca e **conferido** pela fórmula (a composição da fórmula convencional tem de ser igual à fórmula
Hill do PubChem). Entrada que não confere é descartada e registrada em `stats.json`.
"""

LISTA_FIXA_TXT = """
## acido inorganico
Ácido clorídrico | hydrochloric acid | HCl
Ácido sulfúrico | sulfuric acid | H2SO4
Ácido nítrico | nitric acid | HNO3
Ácido fosfórico | phosphoric acid | H3PO4
Ácido carbônico | carbonic acid | H2CO3
Ácido fluorídrico | hydrofluoric acid | HF
Ácido bromídrico | hydrobromic acid | HBr
Ácido iodídrico | hydroiodic acid | HI
Ácido perclórico | perchloric acid | HClO4
Ácido clórico | chloric acid | HClO3
Ácido hipocloroso | hypochlorous acid | HClO
Ácido cloroso | chlorous acid | HClO2
Ácido nitroso | nitrous acid | HNO2
Ácido sulfuroso | sulfurous acid | H2SO3
Ácido fosforoso | phosphorous acid | H3PO3
Ácido hipofosforoso | hypophosphorous acid | H3PO2
Ácido bórico | boric acid | H3BO3
Ácido cianídrico | hydrogen cyanide | HCN
Ácido sulfídrico | hydrogen sulfide | H2S
Ácido crômico | chromic acid | H2CrO4
Ácido silícico | silicic acid | H4SiO4
Ácido pirofosfórico | pyrophosphoric acid | H4P2O7
## acido organico acido_carboxilico
Ácido acético | acetic acid | CH3COOH
Ácido fórmico | formic acid | HCOOH
Ácido propanoico | propionic acid | C2H5COOH | Ácido propiônico
Ácido butanoico | butyric acid | C3H7COOH | Ácido butírico
Ácido pentanoico | valeric acid | C4H9COOH | Ácido valérico
Ácido hexanoico | caproic acid | C5H11COOH | Ácido capróico
Ácido oxálico | oxalic acid | H2C2O4
Ácido málico | malic acid | C4H6O5
Ácido cítrico | citric acid | C6H8O7
Ácido lático | lactic acid | C3H6O3 | Ácido láctico
Ácido tartárico | tartaric acid | C4H6O6
Ácido benzoico | benzoic acid | C6H5COOH
Ácido salicílico | salicylic acid | C7H6O3
Ácido acetilsalicílico | aspirin | C9H8O4 | Aspirina
Ácido ascórbico | ascorbic acid | C6H8O6 | Vitamina C
Ácido esteárico | stearic acid | C18H36O2
Ácido palmítico | palmitic acid | C16H32O2
Ácido oleico | oleic acid | C18H34O2
Ácido linoleico | linoleic acid | C18H32O2
Ácido succínico | succinic acid | C4H6O4
Ácido fumárico | fumaric acid | C4H4O4
Ácido maleico | maleic acid | C4H4O4
Ácido malônico | malonic acid | C3H4O4
Ácido glicólico | glycolic acid | C2H4O3
Ácido pirúvico | pyruvic acid | C3H4O3
Ácido fólico | folic acid | C19H19N7O6 | Vitamina B9
Ácido tricloroacético | trichloroacetic acid | C2HCl3O2
Ácido trifluoroacético | trifluoroacetic acid | C2HF3O2
Ácido metanossulfônico | methanesulfonic acid | CH4O3S
Ácido sórbico | sorbic acid | C6H8O2
Ácido cinâmico | cinnamic acid | C9H8O2
Ácido gálico | gallic acid | C7H6O5
Ácido ftálico | phthalic acid | C8H6O4
Ácido tereftálico | terephthalic acid | C8H6O4
Ácido adípico | adipic acid | C6H10O4
Ácido acrílico | acrylic acid | C3H4O2
Ácido metacrílico | methacrylic acid | C4H6O2
Ácido nicotínico | nicotinic acid | C6H5NO2 | Niacina
Ácido úrico | uric acid | C5H4N4O3
Ácido etilenodiaminotetracético | edetic acid | C10H16N2O8 | EDTA
## base inorganico
Hidróxido de sódio | sodium hydroxide | NaOH | Soda cáustica
Hidróxido de potássio | potassium hydroxide | KOH | Potassa cáustica
Hidróxido de lítio | lithium hydroxide | LiOH
Hidróxido de cálcio | calcium hydroxide | Ca(OH)2 | Cal hidratada
Hidróxido de magnésio | magnesium hydroxide | Mg(OH)2
Hidróxido de bário | barium hydroxide | Ba(OH)2
Hidróxido de estrôncio | strontium hydroxide | Sr(OH)2
Hidróxido de alumínio | aluminum hydroxide | Al(OH)3
Hidróxido de ferro(III) | iron(III) hydroxide | Fe(OH)3
Hidróxido de ferro(II) | iron(II) hydroxide | Fe(OH)2
Hidróxido de cobre(II) | copper(II) hydroxide | Cu(OH)2
Hidróxido de zinco | zinc hydroxide | Zn(OH)2
Hidróxido de césio | cesium hydroxide | CsOH
Hidróxido de rubídio | rubidium hydroxide | RbOH
Hidróxido de níquel(II) | nickel(II) hydroxide | Ni(OH)2
Amônia | ammonia | NH3
## base organico amina
Metilamina | methylamine | CH3NH2
Dimetilamina | dimethylamine | (CH3)2NH
Trimetilamina | trimethylamine | (CH3)3N
Etilamina | ethylamine | C2H5NH2
Trietilamina | triethylamine | (C2H5)3N
Anilina | aniline | C6H5NH2
Etanolamina | ethanolamine | C2H7NO
Ureia | urea | CO(NH2)2 | Carbamida
Piridina | pyridine | C5H5N
## sal inorganico
Cloreto de sódio | sodium chloride | NaCl | Sal de cozinha
Cloreto de potássio | potassium chloride | KCl
Cloreto de cálcio | calcium chloride | CaCl2
Cloreto de magnésio | magnesium chloride | MgCl2
Cloreto de amônio | ammonium chloride | NH4Cl
Cloreto de alumínio | aluminum chloride | AlCl3
Cloreto de ferro(III) | iron(III) chloride | FeCl3
Cloreto de ferro(II) | iron(II) chloride | FeCl2
Cloreto de cobre(II) | copper(II) chloride | CuCl2
Cloreto de zinco | zinc chloride | ZnCl2
Cloreto de prata | silver chloride | AgCl
Cloreto de bário | barium chloride | BaCl2
Cloreto de lítio | lithium chloride | LiCl
Cloreto de estanho(II) | tin(II) chloride | SnCl2
Cloreto de mercúrio(II) | mercury(II) chloride | HgCl2
Cloreto de cobalto(II) | cobalt(II) chloride | CoCl2
Cloreto de níquel(II) | nickel(II) chloride | NiCl2
Cloreto de chumbo(II) | lead(II) chloride | PbCl2
Brometo de sódio | sodium bromide | NaBr
Brometo de potássio | potassium bromide | KBr
Brometo de prata | silver bromide | AgBr
Iodeto de potássio | potassium iodide | KI
Iodeto de sódio | sodium iodide | NaI
Iodeto de prata | silver iodide | AgI
Iodeto de chumbo(II) | lead(II) iodide | PbI2
Fluoreto de sódio | sodium fluoride | NaF
Fluoreto de cálcio | calcium fluoride | CaF2 | Fluorita
Sulfato de sódio | sodium sulfate | Na2SO4
Sulfato de potássio | potassium sulfate | K2SO4
Sulfato de cálcio | calcium sulfate | CaSO4
Sulfato de magnésio | magnesium sulfate | MgSO4
Sulfato de cobre(II) | copper(II) sulfate | CuSO4
Sulfato de cobre(II) pentaidratado | copper(II) sulfate pentahydrate | CuSO4.5H2O | Vitríolo azul
Sulfato de alumínio | aluminum sulfate | Al2(SO4)3
Sulfato de amônio | ammonium sulfate | (NH4)2SO4
Sulfato de ferro(II) | iron(II) sulfate | FeSO4
Sulfato de ferro(III) | iron(III) sulfate | Fe2(SO4)3
Sulfato de zinco | zinc sulfate | ZnSO4
Sulfato de bário | barium sulfate | BaSO4
Sulfato de níquel(II) | nickel(II) sulfate | NiSO4
Sulfato de manganês(II) | manganese(II) sulfate | MnSO4
Sulfato de chumbo(II) | lead(II) sulfate | PbSO4
Sulfato de cálcio di-hidratado | calcium sulfate dihydrate | CaSO4.2H2O | Gesso
Sulfato de alumínio e potássio | aluminum potassium sulfate | KAl(SO4)2 | Alúmen
Sulfito de sódio | sodium sulfite | Na2SO3
Bissulfito de sódio | sodium bisulfite | NaHSO3
Bissulfato de sódio | sodium bisulfate | NaHSO4
Tiossulfato de sódio | sodium thiosulfate | Na2S2O3
Nitrato de sódio | sodium nitrate | NaNO3
Nitrato de potássio | potassium nitrate | KNO3 | Salitre
Nitrato de prata | silver nitrate | AgNO3
Nitrato de cálcio | calcium nitrate | Ca(NO3)2
Nitrato de amônio | ammonium nitrate | NH4NO3
Nitrato de chumbo(II) | lead(II) nitrate | Pb(NO3)2
Nitrato de cobre(II) | copper(II) nitrate | Cu(NO3)2
Nitrato de ferro(III) | iron(III) nitrate | Fe(NO3)3
Nitrato de magnésio | magnesium nitrate | Mg(NO3)2
Nitrato de bário | barium nitrate | Ba(NO3)2
Nitrato de zinco | zinc nitrate | Zn(NO3)2
Nitrito de sódio | sodium nitrite | NaNO2
Carbonato de sódio | sodium carbonate | Na2CO3 | Barrilha
Bicarbonato de sódio | sodium bicarbonate | NaHCO3 | Bicarbonato
Carbonato de cálcio | calcium carbonate | CaCO3 | Calcário
Carbonato de potássio | potassium carbonate | K2CO3
Carbonato de magnésio | magnesium carbonate | MgCO3
Carbonato de amônio | ammonium carbonate | (NH4)2CO3
Carbonato de lítio | lithium carbonate | Li2CO3
Carbonato de bário | barium carbonate | BaCO3
Carbonato de cobre(II) | copper(II) carbonate | CuCO3
Carbonato de zinco | zinc carbonate | ZnCO3
Fosfato trissódico | trisodium phosphate | Na3PO4
Fosfato de cálcio | calcium phosphate | Ca3(PO4)2
Fosfato de diamônio | diammonium phosphate | (NH4)2HPO4
Di-hidrogenofosfato de potássio | monopotassium phosphate | KH2PO4
Hidrogenofosfato de dissódio | disodium hydrogen phosphate | Na2HPO4
Di-hidrogenofosfato de sódio | sodium dihydrogen phosphate | NaH2PO4
Acetato de sódio | sodium acetate | CH3COONa
Acetato de potássio | potassium acetate | CH3COOK
Acetato de cálcio | calcium acetate | Ca(CH3COO)2
Acetato de chumbo(II) | lead(II) acetate | Pb(CH3COO)2
Acetato de amônio | ammonium acetate | CH3COONH4
Permanganato de potássio | potassium permanganate | KMnO4
Dicromato de potássio | potassium dichromate | K2Cr2O7
Cromato de potássio | potassium chromate | K2CrO4
Clorato de potássio | potassium chlorate | KClO3
Hipoclorito de sódio | sodium hypochlorite | NaClO | Água sanitária
Hipoclorito de cálcio | calcium hypochlorite | Ca(ClO)2
Cianeto de sódio | sodium cyanide | NaCN
Cianeto de potássio | potassium cyanide | KCN
Tiocianato de potássio | potassium thiocyanate | KSCN
Sulfeto de sódio | sodium sulfide | Na2S
Sulfeto de ferro(II) | iron(II) sulfide | FeS
Sulfeto de zinco | zinc sulfide | ZnS
Sulfeto de cádmio | cadmium sulfide | CdS
Sulfeto de chumbo(II) | lead(II) sulfide | PbS | Galena
Sulfeto de mercúrio(II) | mercury(II) sulfide | HgS | Cinábrio
Sulfeto de cobre(II) | copper(II) sulfide | CuS
Hidreto de sódio | sodium hydride | NaH
Hidreto de lítio e alumínio | lithium aluminium hydride | LiAlH4
Borohidreto de sódio | sodium borohydride | NaBH4
Tetraborato de sódio | sodium tetraborate | Na2B4O7 | Bórax
Silicato de sódio | sodium silicate | Na2SiO3
Carbeto de cálcio | calcium carbide | CaC2
Citrato trissódico | trisodium citrate | Na3C6H5O7
Glutamato monossódico | monosodium glutamate | C5H8NNaO4
Benzoato de sódio | sodium benzoate | C7H5NaO2
Sorbato de potássio | potassium sorbate | C6H7KO2
Estearato de sódio | sodium stearate | C18H35NaO2
Dodecilsulfato de sódio | sodium dodecyl sulfate | C12H25NaO4S
Dipirona sódica | metamizole sodium | C13H16N3NaO4S
## oxido inorganico
Água | water | H2O
Dióxido de carbono | carbon dioxide | CO2 | Gás carbônico
Monóxido de carbono | carbon monoxide | CO
Dióxido de enxofre | sulfur dioxide | SO2
Trióxido de enxofre | sulfur trioxide | SO3
Monóxido de nitrogênio | nitric oxide | NO | Óxido nítrico
Dióxido de nitrogênio | nitrogen dioxide | NO2
Óxido nitroso | nitrous oxide | N2O | Gás hilariante
Tetróxido de dinitrogênio | dinitrogen tetroxide | N2O4
Pentóxido de dinitrogênio | dinitrogen pentoxide | N2O5
Óxido de cálcio | calcium oxide | CaO | Cal virgem
Óxido de magnésio | magnesium oxide | MgO | Magnésia
Óxido de sódio | sodium oxide | Na2O
Óxido de potássio | potassium oxide | K2O
Óxido de alumínio | aluminum oxide | Al2O3 | Alumina
Óxido de ferro(III) | iron(III) oxide | Fe2O3 | Hematita
Óxido de ferro(II) | iron(II) oxide | FeO
Óxido de ferro(II,III) | iron(II,III) oxide | Fe3O4 | Magnetita
Óxido de zinco | zinc oxide | ZnO
Óxido de cobre(II) | copper(II) oxide | CuO
Óxido de cobre(I) | copper(I) oxide | Cu2O
Óxido de prata | silver oxide | Ag2O
Óxido de mercúrio(II) | mercury(II) oxide | HgO
Óxido de chumbo(II) | lead(II) oxide | PbO | Litargírio
Dióxido de chumbo | lead dioxide | PbO2
Dióxido de silício | silicon dioxide | SiO2 | Sílica
Dióxido de titânio | titanium dioxide | TiO2
Dióxido de manganês | manganese dioxide | MnO2
Óxido de cromo(III) | chromium(III) oxide | Cr2O3
Trióxido de cromo | chromium trioxide | CrO3
Dióxido de estanho | tin(IV) oxide | SnO2
Óxido de bário | barium oxide | BaO
Pentóxido de difósforo | phosphorus pentoxide | P4O10
Trióxido de diboro | boron trioxide | B2O3
Óxido de lítio | lithium oxide | Li2O
Peróxido de hidrogênio | hydrogen peroxide | H2O2 | Água oxigenada
Peróxido de sódio | sodium peroxide | Na2O2
Ozônio | ozone | O3
## gas substancia_simples
Hidrogênio | hydrogen | H2 | Gás hidrogênio
Oxigênio | oxygen | O2 | Gás oxigênio
Nitrogênio | nitrogen | N2 | Gás nitrogênio
Cloro | chlorine | Cl2 | Gás cloro
Flúor | fluorine | F2
Bromo | bromine | Br2
Iodo | iodine | I2
Hélio | helium | He
Neônio | neon | Ne
Argônio | argon | Ar
Criptônio | krypton | Kr
Xenônio | xenon | Xe
## gas inorganico
Fosfina | phosphine | PH3
Silano | silane | SiH4
Hexafluoreto de enxofre | sulfur hexafluoride | SF6
Fosgênio | phosgene | COCl2 | Cloreto de carbonila
## solvente alcool organico
Etanol | ethanol | C2H5OH | Álcool etílico
Metanol | methanol | CH3OH | Álcool metílico
Propan-1-ol | 1-propanol | C3H7OH | Álcool propílico
Propan-2-ol | isopropanol | C3H7OH | Álcool isopropílico
Butan-1-ol | 1-butanol | C4H9OH
Butan-2-ol | 2-butanol | C4H9OH
2-Metilpropan-2-ol | tert-butanol | C4H9OH | terc-Butanol
Pentan-1-ol | 1-pentanol | C5H11OH
Hexan-1-ol | 1-hexanol | C6H13OH
Octan-1-ol | 1-octanol | C8H17OH
Etano-1,2-diol | ethylene glycol | C2H6O2 | Etilenoglicol
Propano-1,2-diol | propylene glycol | C3H8O2 | Propilenoglicol
Propano-1,2,3-triol | glycerol | C3H8O3 | Glicerina
Ciclo-hexanol | cyclohexanol | C6H11OH
Álcool benzílico | benzyl alcohol | C6H5CH2OH
## solvente organico
Acetona | acetone | (CH3)2CO | Propanona
Butanona | 2-butanone | C4H8O | Metil etil cetona
Ciclo-hexanona | cyclohexanone | C6H10O
Éter dietílico | diethyl ether | (C2H5)2O | Éter etílico
Éter dimetílico | dimethyl ether | CH3OCH3
Tetra-hidrofurano | tetrahydrofuran | C4H8O
1,4-Dioxano | 1,4-dioxane | C4H8O2
Éter metil terc-butílico | methyl tert-butyl ether | C5H12O
Clorofórmio | chloroform | CHCl3 | Triclorometano
Diclorometano | dichloromethane | CH2Cl2
Tetracloreto de carbono | carbon tetrachloride | CCl4
Tricloroeteno | trichloroethylene | C2HCl3
Tetracloroeteno | tetrachloroethylene | C2Cl4
1,2-Dicloroetano | 1,2-dichloroethane | C2H4Cl2
Clorometano | chloromethane | CH3Cl
Clorobenzeno | chlorobenzene | C6H5Cl
Acetato de etila | ethyl acetate | CH3COOC2H5
Acetato de metila | methyl acetate | CH3COOCH3
Acetato de butila | butyl acetate | C6H12O2
Acetonitrila | acetonitrile | CH3CN
Dimetilsulfóxido | dimethyl sulfoxide | C2H6OS | DMSO
N,N-Dimetilformamida | N,N-dimethylformamide | C3H7NO | DMF
N-Metilpirrolidona | N-methyl-2-pyrrolidone | C5H9NO
Dissulfeto de carbono | carbon disulfide | CS2
## hidrocarboneto organico alcano
Metano | methane | CH4
Etano | ethane | C2H6
Propano | propane | C3H8
Butano | butane | C4H10
Pentano | pentane | C5H12
Hexano | hexane | C6H14
Heptano | heptane | C7H16
Octano | octane | C8H18
Nonano | nonane | C9H20
Decano | decane | C10H22
2-Metilpropano | isobutane | C4H10 | Isobutano
2-Metilbutano | isopentane | C5H12 | Isopentano
2,2-Dimetilpropano | neopentane | C5H12 | Neopentano
2,2,4-Trimetilpentano | isooctane | C8H18 | Isooctano
## hidrocarboneto organico cicloalcano
Ciclopropano | cyclopropane | C3H6
Ciclobutano | cyclobutane | C4H8
Ciclopentano | cyclopentane | C5H10
Ciclo-hexano | cyclohexane | C6H12
Ciclo-heptano | cycloheptane | C7H14
## hidrocarboneto organico alqueno
Eteno | ethylene | C2H4 | Etileno
Propeno | propylene | C3H6 | Propileno
But-1-eno | 1-butene | C4H8
But-2-eno | 2-butene | C4H8
2-Metilpropeno | isobutylene | C4H8 | Isobutileno
Pent-1-eno | 1-pentene | C5H10
Hex-1-eno | 1-hexene | C6H12
Ciclo-hexeno | cyclohexene | C6H10
## hidrocarboneto organico alquino
Etino | acetylene | C2H2 | Acetileno
Propino | propyne | C3H4
But-1-ino | 1-butyne | C4H6
## hidrocarboneto organico aromatico
Benzeno | benzene | C6H6
Tolueno | toluene | C6H5CH3 | Metilbenzeno
o-Xileno | o-xylene | C8H10
m-Xileno | m-xylene | C8H10
p-Xileno | p-xylene | C8H10
Etilbenzeno | ethylbenzene | C8H10
Cumeno | cumene | C9H12
Naftaleno | naphthalene | C10H8 | Naftalina
Antraceno | anthracene | C14H10
Bifenilo | biphenyl | C12H10
Nitrobenzeno | nitrobenzene | C6H5NO2
Fenol | phenol | C6H5OH | Ácido fênico
o-Cresol | o-cresol | C7H8O
Acetofenona | acetophenone | C8H8O
Benzaldeído | benzaldehyde | C6H5CHO
## monomero organico
Estireno | styrene | C8H8
1,3-Butadieno | 1,3-butadiene | C4H6
2-Metilbuta-1,3-dieno | isoprene | C5H8 | Isopreno
Cloroeteno | vinyl chloride | C2H3Cl | Cloreto de vinila
Tetrafluoroeteno | tetrafluoroethylene | C2F4
Acrilonitrila | acrylonitrile | C3H3N
Metacrilato de metila | methyl methacrylate | C5H8O2
Acetato de vinila | vinyl acetate | C4H6O2
2-Cloro-1,3-butadieno | chloroprene | C4H5Cl | Cloropreno
Caprolactama | caprolactam | C6H11NO
Hexano-1,6-diamina | hexamethylenediamine | C6H16N2
Óxido de etileno | ethylene oxide | C2H4O | Oxirano
Óxido de propileno | propylene oxide | C3H6O
Bisfenol A | bisphenol A | C15H16O2
## aldeido cetona organico
Formaldeído | formaldehyde | CH2O | Metanal
Acetaldeído | acetaldehyde | CH3CHO | Etanal
Propanal | propionaldehyde | C2H5CHO
## haleto_organico organico
Diclorodifluorometano | dichlorodifluoromethane | CCl2F2 | CFC-12
Triclorofluorometano | trichlorofluoromethane | CCl3F | CFC-11
## carboidrato organico
Glicose | glucose | C6H12O6 | Dextrose
Frutose | fructose | C6H12O6
Galactose | galactose | C6H12O6
Manose | mannose | C6H12O6
Ribose | ribose | C5H10O5
Desoxirribose | deoxyribose | C5H10O4
Xilose | xylose | C5H10O5
Sacarose | sucrose | C12H22O11 | Açúcar de mesa
Lactose | lactose | C12H22O11
Maltose | maltose | C12H22O11
Celobiose | cellobiose | C12H22O11
Sorbitol | sorbitol | C6H14O6
Manitol | mannitol | C6H14O6
Xilitol | xylitol | C5H12O5
## aminoacido organico
Glicina | glycine | C2H5NO2
Alanina | alanine | C3H7NO2
Valina | valine | C5H11NO2
Leucina | leucine | C6H13NO2
Isoleucina | isoleucine | C6H13NO2
Prolina | proline | C5H9NO2
Fenilalanina | phenylalanine | C9H11NO2
Triptofano | tryptophan | C11H12N2O2
Metionina | methionine | C5H11NO2S
Serina | serine | C3H7NO3
Treonina | threonine | C4H9NO3
Cisteína | cysteine | C3H7NO2S
Tirosina | tyrosine | C9H11NO3
Asparagina | asparagine | C4H8N2O3
Glutamina | glutamine | C5H10N2O3
Ácido aspártico | aspartic acid | C4H7NO4
Ácido glutâmico | glutamic acid | C5H9NO4
Lisina | lysine | C6H14N2O2
Arginina | arginine | C6H14N4O2
Histidina | histidine | C6H9N3O2
Taurina | taurine | C2H7NO3S
Creatina | creatine | C4H9N3O2
## biomolecula organico
Adenina | adenine | C5H5N5
Guanina | guanine | C5H5N5O
Citosina | cytosine | C4H5N3O
Timina | thymine | C5H6N2O2
Uracila | uracil | C4H4N2O2
Adenosina | adenosine | C10H13N5O4
Trifosfato de adenosina | adenosine triphosphate | C10H16N5O13P3 | ATP
Colesterol | cholesterol | C27H46O
Testosterona | testosterone | C19H28O2
Estradiol | estradiol | C18H24O2
Progesterona | progesterone | C21H30O2
Cortisol | hydrocortisone | C21H30O5 | Hidrocortisona
Adrenalina | epinephrine | C9H13NO3 | Epinefrina
Noradrenalina | norepinephrine | C8H11NO3
Dopamina | dopamine | C8H11NO2
Serotonina | serotonin | C10H12N2O
Melatonina | melatonin | C13H16N2O2
Histamina | histamine | C5H9N3
Ácido gama-aminobutírico | gamma-aminobutyric acid | C4H9NO2 | GABA
## vitamina organico
Retinol | retinol | C20H30O | Vitamina A
Riboflavina | riboflavin | C17H20N4O6 | Vitamina B2
Piridoxina | pyridoxine | C8H11NO3 | Vitamina B6
Biotina | biotin | C10H16N2O3S | Vitamina B7
Colecalciferol | cholecalciferol | C27H44O | Vitamina D3
Alfa-tocoferol | alpha-tocopherol | C29H50O2 | Vitamina E
Filoquinona | phylloquinone | C31H46O2 | Vitamina K1
Betacaroteno | beta-carotene | C40H56
## farmaco organico
Paracetamol | acetaminophen | C8H9NO2 | Acetaminofeno
Ibuprofeno | ibuprofen | C13H18O2
Naproxeno | naproxen | C14H14O3
Diclofenaco | diclofenac | C14H11Cl2NO2
Cafeína | caffeine | C8H10N4O2
Teobromina | theobromine | C7H8N4O2
Teofilina | theophylline | C7H8N4O2
Nicotina | nicotine | C10H14N2
Amoxicilina | amoxicillin | C16H19N3O5S
Benzilpenicilina | penicillin G | C16H18N2O4S | Penicilina G
Azitromicina | azithromycin | C38H72N2O12
Ciprofloxacino | ciprofloxacin | C17H18FN3O3
Doxiciclina | doxycycline | C22H24N2O8
Metformina | metformin | C4H11N5
Omeprazol | omeprazole | C17H19N3O3S
Loratadina | loratadine | C22H23ClN2O2
Cetirizina | cetirizine | C21H25ClN2O3
Dexametasona | dexamethasone | C22H29FO5
Prednisona | prednisone | C21H26O5
Atenolol | atenolol | C14H22N2O3
Propranolol | propranolol | C16H21NO2
Captopril | captopril | C9H15NO3S
Losartana | losartan | C22H23ClN6O
Sinvastatina | simvastatin | C25H38O5
Atorvastatina | atorvastatin | C33H35FN2O5
Furosemida | furosemide | C12H11ClN2O5S
Hidroclorotiazida | hydrochlorothiazide | C7H8ClN3O4S2
Varfarina | warfarin | C19H16O4
Levotiroxina | levothyroxine | C15H11I4NO4
Sildenafila | sildenafil | C22H30N6O4S
Fluoxetina | fluoxetine | C17H18F3NO
Sertralina | sertraline | C17H17Cl2N
Lidocaína | lidocaine | C14H22N2O
Benzocaína | benzocaine | C9H11NO2
Clorexidina | chlorhexidine | C22H30Cl2N10
Salbutamol | albuterol | C13H21NO3
Escopolamina | scopolamine | C17H21NO4
Hidroxicloroquina | hydroxychloroquine | C18H26ClN3O
Oseltamivir | oseltamivir | C16H28N2O4
Aciclovir | acyclovir | C8H11N5O3
Etinilestradiol | ethinylestradiol | C20H24O2
Levonorgestrel | levonorgestrel | C21H28O2
Ondansetrona | ondansetron | C18H19N3O
Metoclopramida | metoclopramide | C14H22ClN3O2
Loperamida | loperamide | C29H33ClN2O2
Ácido valproico | valproic acid | C8H16O2
Carbamazepina | carbamazepine | C15H12N2O
Haloperidol | haloperidol | C21H23ClFNO2
## uso_geral organico
Aspartame | aspartame | C14H18N2O5
Sacarina | saccharin | C7H5NO3S
Sucralose | sucralose | C12H19Cl3O8
Esteviosídeo | stevioside | C38H60O18
Curcumina | curcumin | C21H20O6
Capsaicina | capsaicin | C18H27NO3
Mentol | menthol | C10H20O
Cânfora | camphor | C10H16O
Limoneno | limonene | C10H16
Vanilina | vanillin | C8H8O3
Eugenol | eugenol | C10H12O2
Cinamaldeído | cinnamaldehyde | C9H8O
Linalol | linalool | C10H18O
Alfa-pineno | alpha-pinene | C10H16
Timol | thymol | C10H14O
Resveratrol | resveratrol | C14H12O3
Quercetina | quercetin | C15H10O7
Licopeno | lycopene | C40H56
Índigo | indigo | C16H10N2O2
Luminol | luminol | C8H7N3O2
Fluoresceína | fluorescein | C20H12O5
## indicador organico
Fenolftaleína | phenolphthalein | C20H14O4
Azul de bromotimol | bromothymol blue | C27H28Br2O5S
Vermelho de metila | methyl red | C15H15N3O2
Alaranjado de metila | methyl orange | C14H14N3NaO3S
"""

def parse_lista(texto=LISTA_FIXA_TXT):
    """Devolve [{nome, termo, formula, popular?, classes: [...]}] na ordem do arquivo."""
    itens, classes = [], []
    for bruta in texto.splitlines():
        linha = bruta.strip()
        if not linha:
            continue
        if linha.startswith("##"):
            classes = linha[2:].split()
            continue
        partes = [p.strip() for p in linha.split("|")]
        if len(partes) < 3:
            raise ValueError(f"linha inválida na lista fixa: {linha!r}")
        item = {"nome": partes[0], "termo": partes[1], "formula": partes[2], "classes": list(classes)}
        if len(partes) > 3 and partes[3]:
            item["popular"] = partes[3]
        itens.append(item)
    return itens
