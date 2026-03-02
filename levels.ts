// Map characters to BrickTypes:
// 'X' = NORMAL
// 'T' = TNT
// 'M' = LARGE_TNT
// 'B' = BONUS
// 'S' = SILVER
// 'G' = GOLD

export const LEVELS = [
    // LEVEL 1: Classic block
    [
        "XXXXXXXXXXX",
        "XXXXXXXXXXX",
        ".XXXXXXXXX.",
        ".BXXXXXXXB.",
        "..XXXXXXX..",
        "...BXXXB...",
    ],
    // LEVEL 2: Columns
    [
        "XX..TX..XX.",
        "XX..XX..XX.",
        "TX..XX..XT.",
        "SS..SS..SS.",
        "XX..XT..XX.",
        "B...B....B.",
    ],
    // LEVEL 3: U-Shape
    [
        "S.X.....X.S",
        "S.X.....X.S",
        "S.XX...XX.S",
        "S.XX...XX.S",
        "S.BXXXXXB.S",
        "S.........S",
        "SSSSSSSSSSS",
    ],
    // LEVEL 4: Diamond / Invaders shape
    [
        "....S.S....",
        "...BXTXB...",
        "..XTXXXTX..",
        ".SXXXXXXXS.",
        "G.XBXTXBX.G",
        "G.X.BXB.X.G",
        "G...X.X...G",
    ],
    // LEVEL 5: BOSS (Pulpo Morado)
    [
        "BOSS"
    ],
    // LEVEL 6: Checkerboard
    [
        "X.X.X.X.X.X",
        ".T.B.T.B.T.",
        "X.X.X.X.X.X",
        ".S.S.S.S.S.",
        "X.T.X.T.X.X",
        ".X.B.X.B.X.",
        "X.X.X.X.X.X",
    ],
    // LEVEL 7: Narrow Hallways
    [
        "G.XXXXXXX.G",
        "G.XXXXXXX.G",
        "G...GGG...G",
        "GSS.....SSG",
        "XXX.BXB.XXX",
        "XXX.XXX.XXX",
        "G.G.GGG.G.G",
        "B.S.....S.B",
    ],
    // LEVEL 8: Arrow pointing down
    [
        "B.SSSSSSS.B",
        "...XTXTX...",
        "....XXX....",
        "SS...T...SS",
        "XTX.....XTX",
        "B.G.....G.B",
        "..S.....S..",
    ],
    // LEVEL 9: Zig-Zag
    [
        "...SGGGS...",
        "..SSTXTSS..",
        ".SSSXXBSSS.",
        "X..TXXX..TX",
        "XG.......GX",
        "XXB.....BXX",
        "XXXXXXXXXXX",
        "S.S.S.S.S.S",
    ],
    // LEVEL 10: BOSS 2 (El pulpo regresa)
    [
        "BOSS"
    ],
    // LEVEL 11: Prison
    [
        "GGGG...GGGG",
        "G.X.T.X.X.G",
        "G.G.G.G.G.G",
        "..T.X.B.T..",
        "S.G.G.G.G.S",
        "S.X.B.X.T.S",
        "S.........S",
        "GGGG...GGGG",
    ],
    // LEVEL 12: Shield
    [
        "..SSSSSSS..",
        ".TXTXXXTXT.",
        "SXXBXXXBXXS",
        "SXTXXXXXTXS",
        "STXGGXGGXTS",
        ".SXXXXXXXS.",
        "..SSTXTSS..",
        "....S.S....",
    ],
    // LEVEL 13: Twin towers
    [
        "STXX...XXTS",
        "GTXX...XXTG",
        "SXBX...XBXS",
        "GXTX...XTXG",
        "SXTX...XTXS",
        "GXTX...XTXG",
        "S...GSG...S",
        "G...SGS...G",
    ],
    // LEVEL 14: Final Fortress
    [
        "GSSSSSSSSSG",
        "SXXXXXXXXXS",
        "SXBXXGXXBXS",
        "SXXGGXGGXXS",
        "SXXXXXXXXXS",
        "SXXTXXXTXXS",
        "SXXGXXXGXXS",
        "GSSSSSSSSSG"
    ],
    // LEVEL 15: TRUE BOSS FINALE
    [
        "BOSS"
    ],
    // LEVEL 16: Checkers advanced
    [
        "X.S.X.S.X.S",
        "S.X.S.X.S.X",
        "X.S.X.S.X.S",
        "S.X.B.X.S.X",
        "X.S.X.S.X.S"
    ],
    // LEVEL 17: Plus Sign
    [
        "....S.S....",
        "...STGTS...",
        "..STTGTTS..",
        "SSGGGBGGGSS",
        "..STTGTTS..",
        "...STGTS...",
        "....S.S...."
    ],
    // LEVEL 18: Face
    [
        ".SS.....SS.",
        "BSS.....SSB",
        "...........",
        "XX.......XX",
        "SXXXXXXXXXS",
        ".SXXXXXXXS."
    ],
    // LEVEL 19: Stairs
    [
        "X..........",
        "XX.........",
        "X.X........",
        "X..S.......",
        "X...X......",
        "X....T.....",
        "S.....X....",
        "X......B...",
        "X.......X..",
        "X........X.",
        "S.........S"
    ],
    // LEVEL 20: BOSS DEL REGRESO
    [
        "BOSS"
    ],
    // LEVEL 21: Crosses
    [
        ".T...T...T.",
        "TXT.TXT.TXT",
        ".T...T...T.",
        "...........",
        ".B...T...B.",
        "STS.STS.STS",
        ".S...S...S."
    ],
    // LEVEL 22: Small gaps
    [
        "G.G.G.G.G.G",
        "X.X.X.X.X.X",
        "S.S.S.S.S.S",
        "T.T.T.T.T.T",
        "X.B.X.B.X.X"
    ],
    // LEVEL 23: V shape
    [
        "S.........S",
        ".X.......X.",
        "..T.....T..",
        "...S...S...",
        "....B.B....",
        ".....G....."
    ],
    // LEVEL 24: Core
    [
        "GGGGGGGGGGG",
        "GSSSSSSSSSG",
        "GSTXXXXXTSG",
        "GSXGGGGGXXG",
        "GSXGBBBGXXG",
        "GSXGGGGGXXG",
        "GSTXXXXXTSG",
        "GSSSSSSSSSG"
    ],
    // LEVEL 25: CLON DE LA MÁQUINA
    [
        "BOSS"
    ],
    // LEVEL 26: Chaos
    [
        "XTXBSBXSTSX",
        "SXSBTBSXSBS",
        "B.S.T.S.X.S",
        "XGXXBXXBXXX",
        "S..T..T..XS"
    ],
    // LEVEL 27: Triangles
    [
        ".....G.....",
        "....XGX....",
        "...XTGTX...",
        "..XTSSTSS..",
        ".XXXXXXXXX.",
        "B.........B"
    ],
    // LEVEL 28: Barrier
    [
        "GGGGGGGGGGG",
        "X.X.X.X.X.X",
        "S.S.S.S.S.S",
        "T.T.T.T.T.T",
        "B.B.B.B.B.B",
        "X.X.X.X.X.X",
        "X.X.X.X.X.X"
    ],
    // LEVEL 29: Final Gauntlet
    [
        "G.S.G.S.G.S",
        "SXTXTXTXTXS",
        "G.X.B.X.B.G",
        "S.X.T.X.T.S",
        "G.S.G.S.G.S"
    ],
    // LEVEL 30: DIOS DE LA DESTRUCCIÓN
    [
        "BOSS"
    ]
];

// Map characters to BrickTypes
export const BRICK_MAP: { [key: string]: 'NORMAL' | 'TNT' | 'BONUS' | 'LARGE_TNT' | 'SILVER' | 'GOLD' } = {
    'X': 'NORMAL',
    'T': 'TNT',
    'M': 'LARGE_TNT',
    'B': 'BONUS',
    'S': 'SILVER',
    'G': 'GOLD'
};
