// Component catalogue (public/data/component-categories.json): main category → component type →
// subtype. classify() places a board part in it from its part number family, package, value and
// whatever description is known. Rules run in order; the first that matches wins. Every path named
// here must exist in the catalogue (checked by tests).
export const TAXONOMY_URL='/data/component-categories.json';
const PAS='Passive components',DIS='Discrete semiconductors',IC='Integrated circuits',OPTO='Optoelectronics and displays',SEN='Sensors and transducers',EM='Electromechanical components',CON='Connectors and interconnects',PROT='Circuit protection',TIME='Timing, power sources, and supporting parts';
const SMD_SIZE=/\b(01005|0201|0402|0603|0805|1206|1210|1812|2010|2512)\b/;

// [test, [category, type, subtype]]; ctx = {type, text (lower-case), mpn, pkg, smd}
const RULES=[
 // Integrated circuits by part number family.
 [c=>/^(ESP32|ESP8266|ESP32-?C|ESP32-?S)/.test(c.mpn)||/\besp32\b/.test(c.text),[IC,'System-on-chip','Wireless SoC']],
 [c=>/^(NRF5|CC26|CC13|BL6|RTL87)/.test(c.mpn),[IC,'System-on-chip','Wireless SoC']],
 [c=>/^(STM32|ATSAMD|ATSAM|SAMD|GD32|LPC\d|MK\d|RP2040|RP2350|EFM32|CH32V|PIC32|R7F|MIMXRT|TM4C)/.test(c.mpn),[IC,'Microcontroller','32-bit']],
 [c=>/^(MSP430|PIC24|DSPIC)/.test(c.mpn),[IC,'Microcontroller','16-bit']],
 [c=>/^(ATMEGA|ATTINY|PIC1[0268]|PIC12|AT89|STC\d|N76|STM8|EFM8|CH55)/.test(c.mpn),[IC,'Microcontroller','8-bit']],
 [c=>/^(XC[67]|XC7Z|5CE|10M|ICE40|ECP5|LFE|GW1N)/.test(c.mpn),[IC,'Programmable logic','FPGA']],
 [c=>/^(EPM|XC95|ATF15)/.test(c.mpn),[IC,'Programmable logic','CPLD']],
 [c=>/^(W25Q|GD25Q|MX25|IS25|S25FL|AT25SF)/.test(c.mpn),[IC,'Memory','NOR Flash']],
 [c=>/^(W25N|MT29F|TC58)/.test(c.mpn),[IC,'Memory','NAND Flash']],
 [c=>/^(24C|AT24|M24C|CAT24|25LC|AT25\d|93C)/.test(c.mpn),[IC,'Memory','EEPROM']],
 [c=>/^(IS62|CY62|23LC|IS61)/.test(c.mpn),[IC,'Memory','SRAM']],
 [c=>/^(MT48|IS42|W9[78]|AS4C)/.test(c.mpn),[IC,'Memory','SDRAM']],
 [c=>/^(MT4[01]|K4[ABF]|H5)/.test(c.mpn),[IC,'Memory','DRAM']],
 [c=>/^(FM24|FM25|MB85)/.test(c.mpn),[IC,'Memory','FRAM']],
 [c=>/^(AMS1117|LM1117|NCP1117|LD1117|XC620|AP2112|AP211|MCP17|TLV7|LP298|LP5907|RT9013|HT7[0-9]|ME6211|TPS7A|MIC5|LM1084|LDL)/.test(c.mpn)||/\bldo\b|low[- ]dropout/.test(c.text),[IC,'Power-management IC','LDO']],
 [c=>/^(LM78|L78|LM79|LM317|LM337|7805|7812)/.test(c.mpn),[IC,'Power-management IC','Linear regulator']],
 [c=>/^(MT3608|TPS6102|SX1308|XL6009|LM2577|TPS6100)/.test(c.mpn)||/\bboost (converter|regulator)\b|step[- ]up/.test(c.text),[IC,'Power-management IC','Boost']],
 [c=>/^(TPS6300|LTC3440|TPS6302)/.test(c.mpn)||/buck[- ]boost/.test(c.text),[IC,'Power-management IC','Buck-boost']],
 [c=>/^(LM2596|LM2576|MP1584|MP2307|MP2315|TPS54|TPS56|TPS62|LMR3|LMR1|AP63|RT8|SY8|XL15|MP1470|TPSM)/.test(c.mpn)||/\bbuck\b|step[- ]down/.test(c.text),[IC,'Power-management IC','Buck']],
 [c=>/^(ICL7660|LM2664|TPS6040)/.test(c.mpn)||/charge pump/.test(c.text),[IC,'Power-management IC','Charge pump']],
 [c=>/^(AXP|TPS650|PCA9450|BD718|RK8)/.test(c.mpn)||/\bpmic\b/.test(c.text),[IC,'Power-management IC','PMIC']],
 [c=>/^(TP4056|MCP7383|BQ240|BQ241|BQ2405|LTC405|CN3065|IP5306)/.test(c.mpn)||/battery charger|li-?ion charger/.test(c.text),[IC,'Battery-management IC','Charger']],
 [c=>/^(DW01|FS312|BQ2970|S-8261)/.test(c.mpn),[IC,'Battery-management IC','Protection']],
 [c=>/^(MAX1704|BQ27|LC709)/.test(c.mpn),[IC,'Battery-management IC','Fuel gauge']],
 [c=>/^(LM393|LM339|LM311|TLV3|MCP654|LMV33)/.test(c.mpn)||/\bcomparator\b/.test(c.text),[IC,'Comparator','General-purpose']],
 [c=>/^(INA1[0-9]{2}|AD62|AD8221|INA33)/.test(c.mpn)||/instrumentation amp/.test(c.text),[IC,'Amplifier','Instrumentation']],
 [c=>/^(MA12|TPA3|TDA20|TDA72|PAM84|MAX9835|LM386|NS4168)/.test(c.mpn)||/audio amp/.test(c.text),[IC,'Amplifier','Audio']],
 [c=>/^(LM358|LM324|LM741|TL07|TL08|NE5532|OPA\d|MCP60|LMV3|AD86|TLV9|OP07|LT1|ADA4|TSV|LMC6)/.test(c.mpn)||/op[- ]?amp|operational amplifier/.test(c.text),[IC,'Amplifier','Operational']],
 [c=>/^(ADS1|MCP3[0-9]|AD7|HX711|ADC0|LTC24|MAX1[12])/.test(c.mpn)||/\badc\b|analog[- ]to[- ]digital/.test(c.text),[IC,'Data converter and analog front end','ADC']],
 [c=>/^(MCP47|DAC|AD56|TLV56|MCP48|PCM51)/.test(c.mpn)||/\bdac\b|digital[- ]to[- ]analog/.test(c.text),[IC,'Data converter and analog front end','DAC']],
 [c=>/^(CH340|CH341|CP210|FT232|FT230|FT2232|PL2303|CH9102|USB3300|TUSB|FE1\.1)/.test(c.mpn),[IC,'Interface IC','USB']],
 [c=>/^(MAX232|MAX3232|SP3232|ST3232|MAX202)/.test(c.mpn),[IC,'Interface IC','RS-232']],
 [c=>/^(MAX485|MAX3485|SP3485|SN65HVD7|SN75176|ADM2|THVD)/.test(c.mpn),[IC,'Interface IC','RS-485']],
 [c=>/^(MCP2551|MCP2562|TJA10|SN65HVD23|TCAN|MCP2515|ISO1050)/.test(c.mpn),[IC,'Interface IC','CAN']],
 [c=>/^(TJA1021|LIN)/.test(c.mpn),[IC,'Interface IC','LIN']],
 [c=>/^(W5500|W5100|LAN87|KSZ8|DP838|RTL82|ENC28)/.test(c.mpn),[IC,'Interface IC','Ethernet']],
 [c=>/^(NE555|LM555|TLC555|ICM7555|NE556)/.test(c.mpn),[IC,'Timing IC','Timer']],
 [c=>/^(DS1307|DS3231|PCF85|RV-?3028|M41T|MCP794)/.test(c.mpn),[IC,'Timing IC','RTC']],
 [c=>/^(SI5351|CDCE|LMK|SI53)/.test(c.mpn),[IC,'Timing IC','Clock generator']],
 [c=>/^(ULN200|ULN280|A4988|DRV8|L298|L293|TB6612|TMC2|A3967|BTS7960|DRV10)/.test(c.mpn)||/motor driver/.test(c.text),[IC,'Driver IC','Motor']],
 [c=>/^(IR21|IRS2|TC442|UCC27|LM510|FAN7)/.test(c.mpn)||/gate driver/.test(c.text),[IC,'Driver IC','MOSFET/IGBT gate']],
 [c=>/^(TLC5940|PCA9685|IS31|MAX7219|TM1637|HT16K)/.test(c.mpn)||/led driver/.test(c.text),[IC,'Driver IC','LED']],
 [c=>/^(TPS382|TPS383|MAX809|MAX810|APX809|MCP1316|STM809|TPS3839)/.test(c.mpn)||/reset (supervisor|controller)|supervisor/.test(c.text),[IC,'Supervisory IC','Reset controller']],
 [c=>/^(ATECC|SE05|OPTIGA|SLB96)/.test(c.mpn),[IC,'Security IC','Secure element']],
 [c=>/^(74|SN74|CD4[0-9])/.test(c.mpn)&&/(4051|4052|4053|4067)/.test(c.mpn),[IC,'Analog switch','Multiplexer']],
 [c=>/^(74|SN74|CD40|MC14)/.test(c.mpn)&&/(595|164|165|4094|4021)/.test(c.mpn),[IC,'Logic IC','Shift register']],
 [c=>/^(74|SN74|CD40)/.test(c.mpn)&&/(04|14|1G04|1G14|2G04)/.test(c.mpn.replace(/^(SN)?74[A-Z]*/,'').slice(0,4)),[IC,'Logic IC','Inverter']],
 [c=>/^(74|SN74)/.test(c.mpn)&&/(245|244|125|126|541|1G125|1G07|07)/.test(c.mpn.replace(/^(SN)?74[A-Z]*/,'')),[IC,'Logic IC','Buffer']],
 [c=>/^(74|SN74)/.test(c.mpn)&&/(74|273|374|1G79|1G80)/.test(c.mpn.replace(/^(SN)?74[A-Z]*/,'').slice(0,4)),[IC,'Logic IC','Flip-flop']],
 [c=>/^(74|SN74)/.test(c.mpn)&&/(161|163|393|4040)/.test(c.mpn),[IC,'Logic IC','Counter']],
 [c=>/^(74|SN74|CD40|MC14)/.test(c.mpn),[IC,'Logic IC','Gate']],
 [c=>/^(BME|BMP|SHT|AHT|HDC|SI70|DHT)/.test(c.mpn),[SEN,'Environmental sensor','Humidity']],
 [c=>/^(MPU|ICM|BMI|LSM6|BNO)/.test(c.mpn),[SEN,'Motion sensor','IMU']],
 [c=>/^(ADXL|LIS3|LIS2|MMA)/.test(c.mpn),[SEN,'Motion sensor','Accelerometer']],
 [c=>/^(DS18B20|TMP1|LM75|LM35|MCP98|TMP3|SI705|MAX3185)/.test(c.mpn)||/temperature sensor/.test(c.text),[SEN,'Temperature sensor','Semiconductor temperature sensor']],
 [c=>/^(ACS7|INA2|INA19|INA18|MAX4080)/.test(c.mpn)||/hall[- ]effect|current sensor/.test(c.text),[SEN,'Magnetic/current sensor','Hall-effect']],
 [c=>/^(VL53|VL6180|TFMINI)/.test(c.mpn),[SEN,'Distance sensor','Time-of-flight']],
 [c=>/^(SPH|ICS-?4|INMP|MP34)/.test(c.mpn)||/mems microphone/.test(c.text),[SEN,'Sound transducer','MEMS microphone']],
 [c=>/^(OV\d|IMX|GC0|AR0)/.test(c.mpn),[SEN,'Imaging sensor','CMOS image sensor']],
 [c=>/^(BPW|SFH2|TEMT|BH1750|TSL25|VEML|LTR)/.test(c.mpn)||/ambient light/.test(c.text),[SEN,'Environmental sensor','Ambient-light']],
 // Optoelectronics.
 [c=>/^(MOC30|MOC31)/.test(c.mpn)||/phototriac|triac output/.test(c.text),[OPTO,'Optical isolation','Phototriac optocoupler']],
 [c=>/^(PC817|EL817|TLP|LTV|6N13|4N3|H11)/.test(c.mpn)||/optocoupler|opto-?isolator/.test(c.text),[OPTO,'Optical isolation','Phototransistor optocoupler']],
 [c=>/^(WS28|SK68|APA102|SK98)/.test(c.mpn)||/addressable/.test(c.text),[OPTO,'LED','Addressable']],
 [c=>c.type==='led'&&/rgb/.test(c.text),[OPTO,'LED','RGB']],
 [c=>c.type==='led'&&/infrared|\bir\b|940 ?nm|850 ?nm/.test(c.text),[OPTO,'LED','Infrared']],
 [c=>c.type==='led',[OPTO,'LED','Indicator']],
 [c=>/\b(oled)\b/.test(c.text),[OPTO,'Display','OLED']],
 [c=>/\blcd\b/.test(c.text),[OPTO,'Display','LCD']],
 [c=>/seven[- ]segment|7[- ]segment/.test(c.text),[OPTO,'Display','Seven-segment']],
 // Discrete semiconductors.
 [c=>/^(PESD|ESD|TPD|USBLC|PRTR|SP05)/.test(c.mpn)||/esd protection/.test(c.text),[DIS,'Protection diode','ESD protection']],
 [c=>/^(SMAJ|SMBJ|SMCJ|P6KE|1\.5KE|SMF|TVS)/.test(c.mpn)||/\btvs\b|transient voltage/.test(c.text),[DIS,'Protection diode','TVS']],
 [c=>/^(BZX|BZT|MMSZ|1N47|1N52|1N53|ZMM|BZV)/.test(c.mpn)||/\bzener\b/.test(c.text),[DIS,'Voltage-reference diode','Zener']],
 [c=>/^(SS1|SS2|SS3|SS5|B5819|1N58|BAT|SB[0-9]|MBR|SK[0-9]|PMEG|STPS|RB[0-9]|CUS|DSS)/.test(c.mpn)||/schottky/.test(c.text),[DIS,'Rectifier diode','Schottky']],
 [c=>/^(MB[0-9]+[SF]?$|DB10|KBP|GBU|KBU|ABS|DF0|MB6S|MB10)/.test(c.mpn)||/bridge rectifier/.test(c.text),[DIS,'Rectifier diode','Bridge rectifier']],
 [c=>/^(RS1|FR1|FR3)/.test(c.mpn)||/fast recovery/.test(c.text)&&!/ultra/.test(c.text),[DIS,'Rectifier diode','Fast recovery']],
 [c=>/^(US1|ES1|ES2|UF4|MUR|ES3)/.test(c.mpn)||/ultra[- ]?fast/.test(c.text),[DIS,'Rectifier diode','Ultrafast recovery']],
 [c=>/^(1N4148|1N914|BAS16|BAV|LL4148|MMBD4148|BAW)/.test(c.mpn)||/small[- ]signal|switching diode/.test(c.text),[DIS,'Signal diode','Small-signal switching']],
 [c=>/^(1N400|M[1-7]$|S1[A-M]|1N540|GS1)/.test(c.mpn)||/\brectifier\b/.test(c.text),[DIS,'Rectifier diode','Standard recovery']],
 [c=>/^(BB[0-9]|SMV)/.test(c.mpn)||/varactor|varicap/.test(c.text),[DIS,'RF and special diode','Varactor/varicap']],
 [c=>c.type==='diode',[DIS,'Signal diode','General-purpose']],
 [c=>/^(AO3401|AO3407|SI2301|SI2305|DMG2305|IRF9|IRLML6402|FDN340|BSS84|NTR1P|DMP)/.test(c.mpn)||/p-?channel|p-?ch\b/.test(c.text),[DIS,'MOSFET','P-channel']],
 [c=>/^(BSS138|2N7002|AO3400|AO340|SI2302|IRF|IRL|IRLZ|IRLML|FDN|NTR|DMN|BSS123|IRFZ|STP|CSD|NCE)/.test(c.mpn)||/n-?channel|mosfet/.test(c.text),[DIS,'MOSFET','N-channel']],
 [c=>/^(TIP12|TIP14|ULN|BCV27|MPSA1|2N6)/.test(c.mpn)&&/darlington/.test(c.text+' darlington'),[DIS,'Bipolar transistor (BJT)','Darlington']],
 [c=>/^(2N3906|BC55|BC80|BC85|MMBT3906|S8550|2N2907|BC327|A10|SS8550|MMBTA9)/.test(c.mpn)||/\bpnp\b/.test(c.text),[DIS,'Bipolar transistor (BJT)','PNP']],
 [c=>/^(2N3904|2N2222|BC54|BC81|BC84|MMBT3904|MMBT2222|S8050|BC337|C18|SS8050|MMBTA0|PN2222)/.test(c.mpn)||/\bnpn\b/.test(c.text),[DIS,'Bipolar transistor (BJT)','NPN']],
 [c=>/^(DTC|DTA|PDTC|MUN)/.test(c.mpn),[DIS,'Bipolar transistor (BJT)','Pre-biased/digital']],
 [c=>/^(BT13|BT13|BTA|BTB|Z0|MAC9)/.test(c.mpn)||/\btriac\b/.test(c.text),[DIS,'Thyristor','TRIAC']],
 [c=>/^(BT1[45]|2N50|TYN|C106|S401)/.test(c.mpn)||/\bscr\b|thyristor/.test(c.text),[DIS,'Thyristor','SCR']],
 [c=>/^(IKW|IGW|FGH|IRG|STGW)/.test(c.mpn)||/\bigbt\b/.test(c.text),[DIS,'IGBT','Discrete IGBT']],
 [c=>c.type==='transistor',[DIS,'MOSFET','N-channel']],
 // Circuit protection.
 [c=>/^(MF-|MF[RSU]|PTS|RXEF|RUEF|NANOSMDC|MICROSMD|0ZCJ|0ZCF|BSMD|SMD[0-9]{3})/.test(c.mpn)||/polyfuse|resettable|polyswitch|\bpptc\b/.test(c.text),[PROT,'Resettable protection','Polymer PTC']],
 [c=>/^(MOV|V[0-9]+[A-Z]*[0-9]|S[0-9]+K[0-9]|ERZ|TMOV|B722)/.test(c.mpn)||/varistor|\bmov\b/.test(c.text),[PROT,'Surge protection','MOV']],
 [c=>/gas discharge|\bgdt\b/.test(c.text),[PROT,'Surge protection','Gas-discharge tube']],
 [c=>c.type==='fuse'&&(c.smd||/smd|chip fuse|0603|1206|0805/.test(c.text)),[PROT,'Fuse','SMD']],
 [c=>c.type==='fuse'||/\bfuse\b/.test(c.text),[PROT,'Fuse','Cartridge']],
 // Timing and supporting parts.
 [c=>/\btcxo\b/.test(c.text),[TIME,'Oscillator','TCXO']],[c=>/\bvcxo\b/.test(c.text),[TIME,'Oscillator','VCXO']],[c=>/\bocxo\b/.test(c.text),[TIME,'Oscillator','OCXO']],
 [c=>/^(SIT|DSC1)/.test(c.mpn)||/mems oscillator/.test(c.text),[TIME,'Oscillator','MEMS oscillator']],
 [c=>/oscillator/.test(c.text)||/^(ASE|ASCO|ECS-?2)/.test(c.mpn),[TIME,'Oscillator','XO']],
 [c=>/resonator|^(CSTCE|CSTNE|CSTLS|AWSCR|ZTT|ZTA)/.test(c.text+' '+c.mpn.toLowerCase())||/^(CSTCE|CSTNE|CSTLS|AWSCR)/.test(c.mpn),[TIME,'Crystal/resonator','Ceramic resonator']],
 [c=>c.type==='crystal'||/\bcrystal\b|\bxtal\b|[0-9.]+ ?mhz/.test(c.text)&&c.type!=='chip',[TIME,'Crystal/resonator','Quartz crystal']],
 [c=>/\b(cr2032|cr1220|lir2032|battery holder|coin cell)\b/.test(c.text)||/^(CR2032|CR1220|BS-?7|BH-?)/.test(c.mpn),[TIME,'Battery','Lithium primary']],
 [c=>/^(B05|B12|R-78|TMR|TRACO|IB0|MP1584 MODULE|LM2596 MODULE)/.test(c.mpn)||/dc[-/ ]?dc (module|converter module)/.test(c.text),[TIME,'Power module','DC/DC']],
 [c=>/\bheatsink|heat sink\b/.test(c.text),[TIME,'Thermal part','Heatsink']],
 [c=>/\bstandoff|spacer\b/.test(c.text),[TIME,'Hardware','Standoff']],
 [c=>/^(SIM8|SIM7|EC2|BG9)/.test(c.mpn),[IC,'Wireless/RF IC','Cellular']],[c=>/^(NEO-|L76|ATGM)/.test(c.mpn),[IC,'Wireless/RF IC','GNSS']],[c=>/^(HC-0|JDY)/.test(c.mpn),[IC,'Wireless/RF IC','Bluetooth']],
 [c=>/^(RFM|SX12|CC1101|NRF24)/.test(c.mpn),[IC,'Wireless/RF IC','RF transceiver']],[c=>/^(PN532|PN7|ST25)/.test(c.mpn),[IC,'Wireless/RF IC','NFC']],
 // Electromechanical.
 [c=>/^(AQY|G3MB|CPC1|TLP222)/.test(c.mpn)||/solid[- ]state relay/.test(c.text),[EM,'Relay','Solid-state']],
 [c=>/^(TQ2|G6K|IM0|EC2-)/.test(c.mpn)||/signal relay/.test(c.text),[EM,'Relay','Signal']],
 [c=>/^(G5V|HK19|SRD|JQC|HF46|G5LE)/.test(c.mpn)||/\brelay\b/.test(c.text),[EM,'Relay','Power']],
 [c=>/buzzer|^(CEM|PKM|MLT-|HC09|TMB)/.test(c.text+' '+c.mpn.toLowerCase())||/^(CEM|PKM|MLT|TMB)/.test(c.mpn),[EM,'Audio device','Buzzer']],
 [c=>/\bspeaker\b/.test(c.text),[EM,'Audio device','Speaker']],
 [c=>/\bfan\b/.test(c.text),[EM,'Cooling device','Fan']],
 [c=>/\bmotor\b/.test(c.text)&&c.type!=='chip',[EM,'Motor','Brushed DC']],
 [c=>c.type==='switch'&&/dip/.test(c.text),[EM,'Switch','DIP']],
 [c=>c.type==='switch'&&/slide|^(SS-?12|MSK|PCM12)/.test(c.text+' '+c.mpn.toLowerCase()),[EM,'Switch','Slide']],
 [c=>c.type==='switch'&&/rotary|encoder|^(EC1[12]|PEC)/.test(c.text+' '+c.mpn.toLowerCase()),[EM,'Switch','Rotary']],
 [c=>c.type==='switch'&&/toggle/.test(c.text),[EM,'Switch','Toggle']],
 [c=>c.type==='switch'&&/rocker/.test(c.text),[EM,'Switch','Rocker']],
 [c=>c.type==='switch'||/tact|pushbutton|push button/.test(c.text),[EM,'Switch','Tactile']],
 // Connectors.
 [c=>/\busb\b|usb-?c|micro-?b|type-?c/.test(c.text)&&(c.type==='connector'||/conn|receptacle/.test(c.text)),[CON,'Data connector','USB']],
 [c=>/\bhdmi\b/.test(c.text),[CON,'Data connector','HDMI']],
 [c=>/\brj-?45|rj-?11|modular jack|magjack/.test(c.text)||/^(HR911|J0011|RJHSE|ARJ)/.test(c.mpn),[CON,'Data connector','Modular/RJ']],
 [c=>/d-?sub|db-?9|de-?9|db-?25/.test(c.text),[CON,'Data connector','D-sub']],
 [c=>c.type==='connector'&&/\bu\.?fl\b|\bipex\b/.test(c.text),[CON,'RF connector','U.FL']],[c=>c.type==='connector'&&/\bbnc\b/.test(c.text),[CON,'RF connector','BNC']],
 [c=>c.type==='connector'&&/\bsmb\b/.test(c.text),[CON,'RF connector','SMB']],[c=>c.type==='connector'&&/\bsma\b/.test(c.text),[CON,'RF connector','SMA']],
 [c=>/barrel|dc jack|power jack|\bdc-?0|pj-?0|^(PJ-|DCJ|DC-0)/.test(c.text+' '+c.mpn.toLowerCase())||/^(PJ-|DCJ)/.test(c.mpn),[CON,'Power connector','Barrel']],
 [c=>/terminal block|screw terminal|^(17922|17923|17924|1792|1935|KF301|KF128|DG301|TB-)/.test(c.text+' '+c.mpn.toLowerCase())||/^(17922|17923|1792|1935|KF301|KF128|DG301)/.test(c.mpn),[CON,'Terminal connection','Screw terminal']],
 [c=>/\b(jst|molex|picoblade|micro-?fit|mini-?fit|xh|ph 2\.0|zh 1\.5)\b|^(B[0-9]B-|S[0-9]B-|5300|53047|43650|SM0[0-9]B)/.test(c.text+' '+c.mpn.toLowerCase())||/^(B[0-9]B-|S[0-9]B-|53047|43650|SM0[0-9]B)/.test(c.mpn),[CON,'PCB connector','Wire-to-board']],
 [c=>/\bffc\b|\bfpc\b/.test(c.text),[CON,'Other interconnect','FFC/FPC connector']],
 [c=>/test ?point|^TP\d/.test(c.text),[CON,'Other interconnect','Test point']],
 [c=>/socket|female header|^(6130[0-9]{3}21|PPTC)/.test(c.text+' '+c.mpn.toLowerCase())&&c.type==='connector',[CON,'PCB connector','Socket']],
 [c=>c.type==='connector'||/pin ?header|\b[12]x\d+\b|^(6130|61300|PH1-|M20-)/.test(c.text+' '+c.mpn.toLowerCase()),[CON,'PCB connector','Pin header']],
 // Passives.
 [c=>/\bptc thermistor\b|^(PRF|POS)/.test(c.text),[PAS,'Thermistor','PTC']],
 [c=>/\bntc\b|thermistor/.test(c.text)||/^(NCP1[58]|NCU|B5799|NTCG|NTCLE|MF52)/.test(c.mpn),[PAS,'Thermistor','NTC']],
 [c=>c.type==='resistor'&&/network|array|^(CAY|EXB|4D0|YC1[0-9]4|CRA)/.test(c.text+' '+c.mpn.toLowerCase()),[PAS,'Special resistor','Resistor network/array']],
 [c=>c.type==='resistor'&&(/shunt|current[- ]sense/.test(c.text)||c.ohms!=null&&c.ohms<1),[PAS,'Special resistor','Current-sense/shunt']],
 [c=>/\btrimmer\b|\btrimpot\b/.test(c.text)||/^(3296|3362|PV36|3266|TC33)/.test(c.mpn),[PAS,'Variable resistor','Trimmer']],
 [c=>/potentiometer/.test(c.text)||/^(RV09|RK09|PTV|RK16|ALPS)/.test(c.mpn),[PAS,'Variable resistor','Potentiometer']],
 [c=>c.type==='resistor'&&/thin film|^(ERA|TNPW|RG[0-9]{4}|PAT)/.test(c.text+' '+c.mpn.toLowerCase()),[PAS,'Fixed resistor','Thin film']],
 [c=>c.type==='resistor'&&!c.smd&&/metal film|\bmf\b|^(MFR|CMF)/.test(c.text+' '+c.mpn.toLowerCase()),[PAS,'Fixed resistor','Metal film']],
 [c=>c.type==='resistor'&&/wirewound|wire[- ]wound/.test(c.text),[PAS,'Fixed resistor','Wirewound']],
 [c=>c.type==='resistor'&&!c.smd,[PAS,'Fixed resistor','Carbon film']],
 [c=>c.type==='resistor',[PAS,'Fixed resistor','Thick film']],
 [c=>/supercap|ultracap|edlc|double[- ]layer/.test(c.text),[PAS,'Supercapacitor','Electric double-layer']],
 [c=>c.type==='capacitor'&&(/^(T520|TCJ|T52|TPC)/.test(c.mpn)||/tantalum polymer|polymer tantalum/.test(c.text)),[PAS,'Tantalum capacitor','Polymer']],
 [c=>c.type==='capacitor'&&(/tantalum|\btant\b/.test(c.text)||/^(T491|T495|TAJ|293D|F93|TPS[A-Z])/.test(c.mpn)),[PAS,'Tantalum capacitor','Solid manganese dioxide']],
 [c=>c.type==='capacitor'&&/aluminium polymer|aluminum polymer|polymer capacitor/.test(c.text),[PAS,'Aluminium capacitor','Polymer']],
 [c=>c.type==='capacitor'&&(/electrolytic|\belco\b|\bcp_|elec|radial|aluminium|aluminum/.test(c.text)||/^(ECA|EEE|EEU|UVR|UVZ|UPW|UCL|EKY|ESK|EMVA|RVT|865)/.test(c.mpn)),[PAS,'Aluminium capacitor','Wet electrolytic']],
 [c=>c.type==='capacitor'&&(/polypropylene|\bmkp\b|\bx2\b/.test(c.text)||/^(B3292|R46|MKP)/.test(c.mpn)),[PAS,'Film capacitor','Polypropylene']],
 [c=>c.type==='capacitor'&&(/film|polyester|\bmkt\b/.test(c.text)||/^(ECQ|MKT)/.test(c.mpn)),[PAS,'Film capacitor','Polyester']],
 [c=>c.type==='capacitor'&&/trimmer|variable/.test(c.text),[PAS,'Variable capacitor','Trimmer']],
 [c=>c.type==='capacitor',[PAS,'Ceramic capacitor','Multilayer (MLCC)']],
 [c=>/ferrite bead|\bbead\b|^(BLM|MPZ|FBMH|BK1608|HZ0|MMZ|CIM)/.test(c.text+' '+c.mpn.toLowerCase())||/^(BLM|MPZ|FBMH|BK16|MMZ|CIM)/.test(c.mpn)||/^FB\d/.test(c.ref||''),[PAS,'Ferrite component','Ferrite bead']],
 [c=>/common[- ]mode/.test(c.text)||/^(ACM|DLW|ACT45|744232)/.test(c.mpn),[PAS,'Choke','Common-mode choke']],
 [c=>/transformer/.test(c.text)&&/isolat/.test(c.text),[PAS,'Transformer','Isolation']],[c=>/transformer/.test(c.text)&&/pulse|ethernet|\blan\b/.test(c.text),[PAS,'Transformer','Pulse']],[c=>/transformer/.test(c.text),[PAS,'Transformer','Power']],
 [c=>/\bbaw\b/.test(c.text)&&/filter/.test(c.text),[PAS,'Filter','BAW']],[c=>/\bsaw\b/.test(c.text)&&/filter/.test(c.text),[PAS,'Filter','SAW']],
 [c=>/emi filter|feedthrough/.test(c.text),[PAS,'Filter','EMI/RFI']],
 [c=>c.type==='inductor'&&/air[- ]core/.test(c.text),[PAS,'Inductor','Air-core']],
 [c=>c.type==='inductor',[PAS,'Inductor','Ferrite-core']],
 // Part-master families ("Power IC / Switching regulator / PWM / Gate driver"), when nothing above
 // matched: the family picks the type, the description picks the subtype.
 [c=>/switching regulator|gate driver/.test(c.fam)&&/gate driver|half-bridge|high-side/.test(c.desc),[IC,'Driver IC','MOSFET/IGBT gate']],
 [c=>/switching regulator/.test(c.fam)&&/boost|step-up/.test(c.desc),[IC,'Power-management IC','Boost']],
 [c=>/switching regulator/.test(c.fam)&&/buck-boost|sepic|inverting/.test(c.desc),[IC,'Power-management IC','Buck-boost']],
 [c=>/switching regulator|\bpwm\b/.test(c.fam),[IC,'Power-management IC','Buck']],
 [c=>/linear regulator|reference/.test(c.fam)&&/\bldo\b|low.?dropout/.test(c.desc),[IC,'Power-management IC','LDO']],
 [c=>/linear regulator|reference/.test(c.fam),[IC,'Power-management IC','Linear regulator']],
 [c=>/motor driver/.test(c.fam),[IC,'Driver IC','Motor']],
 [c=>/battery/.test(c.fam)&&/charg/.test(c.desc),[IC,'Battery-management IC','Charger']],
 [c=>/battery/.test(c.fam)&&/fuel gauge|gas gauge/.test(c.desc),[IC,'Battery-management IC','Fuel gauge']],
 [c=>/battery/.test(c.fam)&&/protect/.test(c.desc),[IC,'Battery-management IC','Protection']],
 [c=>/battery|power management/.test(c.fam)&&/pmic|power management|sequenc/.test(c.desc),[IC,'Power-management IC','PMIC']],
 [c=>/battery|power management|sensing/.test(c.fam)&&/current|hall/.test(c.desc),[SEN,'Magnetic/current sensor','Hall-effect']],
 [c=>/battery|power management/.test(c.fam),[IC,'Battery-management IC','Battery monitor']],
 [c=>/microcontroller|soc|wireless module/.test(c.fam)&&/wi-?fi|bluetooth|\bble\b|lora|zigbee|thread|802\.15|sub-ghz|wireless|\brf\b/.test(c.desc),[IC,'System-on-chip','Wireless SoC']],
 [c=>/microcontroller|\bmcu\b/.test(c.fam)&&/8-bit|\bavr\b|8051|\bpic1/.test(c.desc),[IC,'Microcontroller','8-bit']],
 [c=>/microcontroller|\bmcu\b/.test(c.fam)&&/16-bit|msp430/.test(c.desc),[IC,'Microcontroller','16-bit']],
 [c=>/microcontroller|\bmcu\b|soc/.test(c.fam),[IC,'Microcontroller','32-bit']],
 [c=>/fpga|cpld|processor|programmable/.test(c.fam)&&/cpld/.test(c.desc),[IC,'Programmable logic','CPLD']],
 [c=>/fpga|cpld|processor|programmable/.test(c.fam)&&/processor|cortex-a|\bmpu\b|\bsoc\b|linux/.test(c.desc),[IC,'Processor','Application processor']],
 [c=>/fpga|cpld|processor|programmable/.test(c.fam),[IC,'Programmable logic','FPGA']],
 [c=>/memory/.test(c.fam)&&/eeprom/.test(c.desc),[IC,'Memory','EEPROM']],[c=>/memory/.test(c.fam)&&/\bsram\b/.test(c.desc),[IC,'Memory','SRAM']],
 [c=>/memory/.test(c.fam)&&/sdram/.test(c.desc),[IC,'Memory','SDRAM']],[c=>/memory/.test(c.fam)&&/dram|ddr/.test(c.desc),[IC,'Memory','DRAM']],
 [c=>/memory/.test(c.fam)&&/fram|f-?ram/.test(c.desc),[IC,'Memory','FRAM']],[c=>/memory/.test(c.fam)&&/nand/.test(c.desc),[IC,'Memory','NAND Flash']],
 [c=>/memory/.test(c.fam),[IC,'Memory','NOR Flash']],
 [c=>/op-amp|comparator|instrumentation/.test(c.fam)&&/comparator/.test(c.desc),[IC,'Comparator','General-purpose']],
 [c=>/op-amp|comparator|instrumentation/.test(c.fam)&&/instrumentation/.test(c.desc),[IC,'Amplifier','Instrumentation']],
 [c=>/op-amp|comparator|instrumentation/.test(c.fam),[IC,'Amplifier','Operational']],
 [c=>/adc|dac|digital pot/.test(c.fam)&&/\bdac\b|digital-to-analog/.test(c.desc),[IC,'Data converter and analog front end','DAC']],
 [c=>/adc|dac|digital pot/.test(c.fam)&&/pot/.test(c.desc),[IC,'Digital potentiometer','Nonvolatile']],
 [c=>/adc|dac|digital pot/.test(c.fam),[IC,'Data converter and analog front end','ADC']],
 [c=>/timer|audio|sensor/.test(c.fam)&&/timer|oscillator/.test(c.desc),[IC,'Timing IC','Timer']],
 [c=>/timer|audio|sensor/.test(c.fam)&&/temperature/.test(c.desc),[SEN,'Temperature sensor','Semiconductor temperature sensor']],
 [c=>/timer|audio|sensor/.test(c.fam)&&/humidity|pressure|gas/.test(c.desc),[SEN,'Environmental sensor','Humidity']],
 [c=>/timer|audio|sensor/.test(c.fam)&&/acceler|gyro|\bimu\b|motion/.test(c.desc),[SEN,'Motion sensor','IMU']],
 [c=>/timer|audio|sensor/.test(c.fam)&&/hall|magnet/.test(c.desc),[SEN,'Magnetic/current sensor','Hall-effect']],
 [c=>/timer|audio|sensor/.test(c.fam)&&/codec/.test(c.desc),[IC,'Audio/video IC','Codec']],
 [c=>/timer|audio|sensor/.test(c.fam)&&/amplifier|class-?d|speaker|headphone/.test(c.desc),[IC,'Amplifier','Audio']],
 [c=>/timer|audio|sensor/.test(c.fam),[IC,'Audio/video IC','Audio processor']],
 [c=>/logic|74hc|74ls|cd4000/.test(c.fam),[IC,'Logic IC','Gate']],
 [c=>/interface/.test(c.fam)&&/usb/.test(c.desc),[IC,'Interface IC','USB']],[c=>/interface/.test(c.fam)&&/\bcan\b|can fd|can transceiver/.test(c.desc),[IC,'Interface IC','CAN']],
 [c=>/interface/.test(c.fam)&&/ethernet|\bphy\b/.test(c.desc),[IC,'Interface IC','Ethernet']],[c=>/interface/.test(c.fam)&&/rs-?485|rs-?422/.test(c.desc),[IC,'Interface IC','RS-485']],
 [c=>/interface/.test(c.fam)&&/rs-?232/.test(c.desc),[IC,'Interface IC','RS-232']],[c=>/interface/.test(c.fam)&&/\blin\b/.test(c.desc),[IC,'Interface IC','LIN']],
 [c=>/interface/.test(c.fam)&&/pcie|pci express/.test(c.desc),[IC,'Interface IC','PCIe']],
 [c=>/interface/.test(c.fam)&&/display|lcd|oled|led driver/.test(c.desc),[IC,'Driver IC','Display']],
 [c=>/interface/.test(c.fam)&&/\bmux\b|multiplexer|switch/.test(c.desc),[IC,'Analog switch','Multiplexer']],
 [c=>/interface/.test(c.fam),[IC,'Interface IC','UART']],
 [c=>/opto sensor|optoelectronic/.test(c.fam)&&c.type!=='led',[OPTO,'Optical detector','Phototransistor']],
 // Remaining ICs and modules.
 [c=>c.type==='module',[TIME,'Power module','DC/DC'],c=>/power|dc-?dc|regulator|converter/.test(c.text)],
 [c=>c.type==='chip',[IC,'Microcontroller','32-bit'],c=>/microcontroller|\bmcu\b|cortex/.test(c.text)],
 [c=>c.type==='chip'&&/\bmemory|flash\b/.test(c.text),[IC,'Memory','NOR Flash']],
];

const parseOhms=v=>{const m=/^\s*([0-9]+(?:[.,][0-9]+)?)\s*([RKM]?)\s*(?:Ω|ohms?)?\s*$|^\s*([0-9]+)([RKM])([0-9]+)\s*$/i.exec(String(v||''));if(!m)return null;
 if(m[3])return parseFloat(m[3]+'.'+m[5])*({R:1,K:1e3,M:1e6}[m[4].toUpperCase()]);return parseFloat(m[1].replace(',','.'))*({'':1,R:1,K:1e3,M:1e6}[m[2].toUpperCase()])};

// A part type from words alone, for parts known only by a description (Google look-ups, imports).
export function guessType(text){
 const t=String(text||'').toLowerCase();
 if(/\bled\b|light[- ]emitting/.test(t))return 'led';
 if(/capacitor|\bmlcc\b|\b\d+(\.\d+)? ?[pnuµ]f\b/.test(t))return 'capacitor';
 if(/inductor|\bchoke\b|ferrite bead/.test(t))return 'inductor';
 if(/resistor|\b\d+(\.\d+)? ?k?(ohm|Ω)/.test(t))return 'resistor';
 if(/diode|rectifier|zener|schottky|\btvs\b/.test(t))return 'diode';
 if(/mosfet|transistor|\bbjt\b|\bigbt\b/.test(t))return 'transistor';
 if(/connector|pin header|receptacle|terminal block|\bsocket\b|\bjack\b/.test(t))return 'connector';
 if(/crystal|resonator|oscillator/.test(t))return 'crystal';
 if(/\bfuse\b|polyfuse|resettable/.test(t))return 'fuse';
 if(/\bswitch\b|pushbutton|tactile/.test(t))return 'switch';
 if(/\bmodule\b/.test(t))return 'module';
 if(/\bic\b|microcontroller|\bmcu\b|regulator|amplifier|converter|driver|controller|memory|\bflash\b|transceiver|sensor|op-?amp|logic|timer|interface/.test(t))return 'chip';
 return 'other';
}
// part: board part ({type, mpn, value, package, leads, ref}); details: {description, title, package}.
export function classify(part,details=null){
 const mpn=String(part?.mpn||'').toUpperCase().replace(/\s+/g,''),pkg=String(part?.package||details?.package||'');
 const text=[part?.mpn,part?.value,pkg,details?.title,details?.description,part?.description].filter(Boolean).join(' ').toLowerCase();
 const desc=[details?.title,details?.description,part?.description].filter(Boolean).join(' ').toLowerCase(),fam=String(details?.family||'').toLowerCase();
 const smd=part?.leads!=='tht'&&(SMD_SIZE.test(pkg)||/^(SOT|SOD|SOIC|SOP|SSOP|TSSOP|MSOP|QFN|DFN|QFP|LQFP|TQFP|BGA|SMA|SMB|SMC|SON|WLCSP|0[0-9]{3})/i.test(pkg)||/smd|smt/i.test(text));
 const ctx={type:part?.type&&part.type!=='other'?part.type:guessType(text),text,desc,fam,mpn,pkg,smd,ref:part?.ref||'',ohms:part?.type==='resistor'?parseOhms(part?.value):null};
 for(const [test,at,also] of RULES)if(test(ctx)&&(!also||also(ctx)))return {category:at[0],type:at[1],subtype:at[2],mounting:part?.leads==='tht'?'Through-hole':smd?'Surface-mount (SMD/SMT)':''};
 return {category:'',type:'',subtype:'',mounting:part?.leads==='tht'?'Through-hole':smd?'Surface-mount (SMD/SMT)':''};
}
export const rulePaths=()=>RULES.map(r=>r[1]);

// Flat list of every catalogue node, for the browser tree and for search.
export function catalogueNodes(tax){
 const out=[];for(const c of tax?.categories||[]){out.push({level:0,category:c.name,label:c.name});for(const t of c.component_types){out.push({level:1,category:c.name,type:t.name,label:t.name});for(const s of t.subtypes)out.push({level:2,category:c.name,type:t.name,subtype:s,label:s})}}return out;
}
