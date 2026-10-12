"""Sun Winner colour palette 07.2026.

Sources (transcribed, see URLs):
- colour numbers, names, RAL and surcharge group: Sun Winner coating surcharge calculator 07.2026
  https://sunwinner.pl/wp-content/uploads/2026/07/Sun-Winner-kalkulator-doplat-lakierowania-EN-EUR-072026.html
- on-screen hex and wood-like names (01D–45D): Sun Winner online configurator https://konfiguratory.online/sunwinner/
Wood-like colours ship as textures there; the hex below is an approximate base tone per species (ASSUMPTION, visual only).
"""
import json

# id, name (EN), RAL/reference, group, hex
COLORS = [
 ('01', 'Cream white structured', 'RAL 9010', 'standard', '#F4F4F0'),
 ('04', 'Anthracite structured ST-1', 'RAL 7016', 'standard', '#383E42'),
 ('02', 'Brown metallic structured', '', 'fine', '#5E4637'),
 ('03', 'Silver metallic structured', 'RAL 9006', 'fine', '#B9BDC2'),
 ('05', 'Anthracite metallic structured ST-2', '', 'fine', '#4A4C52'),
 ('06', 'Anthracite metallic structured ST-3', 'DB 703', 'fine', '#55585C'),
 ('07', 'Black structured', 'RAL 9005', 'fine', '#0A0A0A'),
 ('32', 'Grey-beige structured matt', 'RAL 7039', 'fine', '#8D8576'),
 ('33', 'Elegant grey structured matt', 'RAL 7043', 'fine', '#4D555A'),
 ('34', 'Warm stone structured metallic', '', 'fine', '#A59B8B'),
 ('35', 'Brown mood structured metallic', '', 'fine', '#6D5848'),
 ('08', 'White matt', 'RAL 9016', 'smooth', '#F8F8F6'),
 ('09', 'Cream matt', 'RAL 1013', 'smooth', '#EDE5D3'),
 ('10', 'Brown matt', 'RAL 8019', 'smooth', '#4A3B33'),
 ('11', 'Silver matt', 'RAL 9006', 'smooth', '#BCC0C4'),
 ('12', 'Anthracite matt', 'RAL 7016', 'smooth', '#383E42'),
 ('13', 'Black matt', 'RAL 9005', 'smooth', '#111111'),
 ('36', 'Classic silver metallic', 'RAL 9022', 'smooth', '#AEB2B6'),
 ('37', 'Champagne gold metallic', 'ANODA C31', 'smooth', '#C6B28B'),
 ('14', 'Beige matt', '', 'exclusive', '#D4C2A8'),
 ('15', 'Champagne gold matt', 'ANODA C31', 'exclusive', '#C9B58D'),
 ('16', 'Gold matt', '', 'exclusive', '#B99642'),
 ('17', 'Gold olive matt', 'ANODA C32', 'exclusive', '#94835C'),
 ('18', 'Copper bronze matt', '', 'exclusive', '#875A43'),
 ('19', 'Dark bronze matt', '', 'exclusive', '#4F3B32'),
 ('20', 'Silver matt (exclusive)', '', 'exclusive', '#BFC3C6'),
 ('21', 'Pearl white structured', '', 'exclusive', '#F4F2EC'),
 ('22', 'Cool white structured', '', 'exclusive', '#F5F7F8'),
 ('23', 'Light beige structured', '', 'exclusive', '#DCCFB7'),
 ('24', 'Beige structured', '', 'exclusive', '#C7B08D'),
 ('25', 'Blue-grey structured', '', 'exclusive', '#7D8893'),
 ('26', 'Olive structured', '', 'exclusive', '#6F6A4A'),
 ('27', 'Grey-brown structured', '', 'exclusive', '#76695C'),
 ('28', 'Brown structured', '', 'exclusive', '#6A4F3D'),
 ('29', 'Dark brown structured', '', 'exclusive', '#49372D'),
 ('30', 'Navy anthracite structured', '', 'exclusive', '#343B47'),
 ('31', 'Black structured (exclusive)', '', 'exclusive', '#111111'),
]
RU = {
 '01': 'Кремово-белый структурный', '04': 'Антрацит структурный ST-1', '02': 'Коричневый металлик структурный', '03': 'Серебро металлик структурный',
 '05': 'Антрацит металлик структурный ST-2', '06': 'Антрацит металлик структурный ST-3', '07': 'Чёрный структурный', '32': 'Серо-бежевый структурный мат',
 '33': 'Элегантный серый структурный мат', '34': 'Тёплый камень структурный металлик', '35': 'Коричневый структурный металлик', '08': 'Белый мат',
 '09': 'Кремовый мат', '10': 'Коричневый мат', '11': 'Серебристый мат', '12': 'Антрацит мат', '13': 'Чёрный мат', '36': 'Классическое серебро металлик',
 '37': 'Шампань металлик', '14': 'Бежевый мат', '15': 'Шампань мат', '16': 'Золотой мат', '17': 'Золотая олива мат', '18': 'Медная бронза мат',
 '19': 'Тёмная бронза мат', '20': 'Серебро мат (эксклюзив)', '21': 'Жемчужно-белый структурный', '22': 'Холодный белый структурный',
 '23': 'Светло-бежевый структурный', '24': 'Бежевый структурный', '25': 'Сине-серый структурный', '26': 'Оливковый структурный',
 '27': 'Серо-коричневый структурный', '28': 'Коричневый структурный', '29': 'Тёмно-коричневый структурный', '30': 'Антрацит-индиго структурный',
 '31': 'Чёрный структурный (эксклюзив)',
}
WOOD = ['Natural OAK 2DS', 'Pine 8DS', 'Winschester 8DS', 'Wenge 3DS', 'Travertine 4DS', 'Acacia 4DS', 'Rovere 316 4DS', 'Birch 4DS',
        'Natural OAK 14DS', 'Pine 4DS', 'Rovere 316 8DS', 'Douglas 8DS', 'Acacia 8DS', 'Rovere P 8DS', 'Noce 301 8DS', 'Golden OAK 8DS',
        'Ciliegio 8DS', 'Apple 8DS', 'Rovere P 7DS', 'Douglas 7DS', 'Amber OAK 9DS', 'Nut 9DS', 'Noce T 8DS', 'Oak 8DS', 'Acacia 7DS',
        'Rovere F 7DS', 'Nut 7DS', 'Golden OAK 7DS', 'Ciliegio 7DS', 'Oak 7DS', 'Apple 7DS', 'Noce B 7DS', 'Nut 3DS', 'Noce T 7DS',
        'Radica 7DS', 'Swamp OAK 3DS', 'African WENGE 3DS', 'Ciliegio 5DS', 'Acacia 5DS', 'Rovere F 5DS', 'Noce T 5DS', 'Locarno APPLE 5DS',
        'Noce T 6DS', 'Mahogany 6DS', 'African WENGE 6DS']
# ASSUMPTION: approximate base tone per wood species for the 3D preview only.
SPECIES = [('swamp oak', '#5B4636'), ('african wenge', '#33241B'), ('wenge', '#3B2A20'), ('golden oak', '#A8743A'), ('amber oak', '#9A6430'),
           ('natural oak', '#B8925F'), ('oak', '#A9834F'), ('pine', '#D2B07A'), ('winschester', '#8A6A47'), ('travertine', '#CDBFA4'),
           ('acacia', '#A86B3C'), ('rovere', '#9C7A55'), ('birch', '#DCC8A2'), ('douglas', '#B07A48'), ('noce', '#6B4A33'), ('nut', '#6B4A33'),
           ('ciliegio', '#8E4B2F'), ('apple', '#B9814E'), ('radica', '#7A4A2E'), ('mahogany', '#6A2E22')]

def wood_hex(name):
    n = name.lower()
    return next(h for k, h in SPECIES if k in n)

out = {'source': __doc__.strip(), 'colors': []}
for cid, en, ral, group, hx in COLORS:
    out['colors'].append({'id': cid, 'name': en, 'nameRu': RU[cid], 'ral': ral, 'group': group, 'hex': hx, 'finish': 'metallic' if 'metallic' in en.lower() else ('matt' if 'matt' in en.lower() else 'structured')})
for i, name in enumerate(WOOD, 1):
    out['colors'].append({'id': f'{i:02d}D', 'name': name, 'nameRu': name, 'ral': '', 'group': 'wood', 'hex': wood_hex(name), 'finish': 'wood'})
out['customGroups'] = [
 {'group': 'ralAny', 'name': 'Any RAL (matt, semi-matt, gloss)', 'nameRu': 'Любой RAL (мат, полумат, глянец)'},
 {'group': 'ralMetallic', 'name': 'Any metallic RAL colour', 'nameRu': 'Любой RAL металлик'},
 {'group': 'structural', 'name': 'Any structural colour (non-metallic)', 'nameRu': 'Любой структурный цвет'},
]
json.dump(out, open('data/sunwinner/2026-07/colors.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(out['colors']), 'colours;', sum(c['group'] == 'wood' for c in out['colors']), 'wood')
