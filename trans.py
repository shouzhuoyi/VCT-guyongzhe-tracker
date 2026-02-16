#!/usr/bin/env python3
"""
VALORANT 游戏数据格式转换工具 v2.0
支持直接读取Fiddler抓取的gzip压缩JSON文件
"""

import gzip
import json
import sys
from typing import Any, Dict, List

# ========== 映射表 ==========

MAP_ID_TO_NAME = {
    "/Game/Maps/Ascent/Ascent": "Ascent",
    "/Game/Maps/Bind/Bind": "Bind",
    "/Game/Maps/Bonsai/Bonsai": "Split",
    "/Game/Maps/Canyon/Canyon": "Fracture",
    "/Game/Maps/Duality/Duality": "Bind",
    "/Game/Maps/Foxtrot/Foxtrot": "Breeze",
    "/Game/Maps/Haven/Haven": "Haven",
    "/Game/Maps/Icebox/Icebox": "Icebox",
    "/Game/Maps/Jam/Jam": "Lotus",
    "/Game/Maps/Juliett/Juliett": "Sunset",
    "/Game/Maps/Pitt/Pitt": "Pearl",
    "/Game/Maps/Port/Port": "Icebox",
    "/Game/Maps/Triad/Triad": "Haven",
    "/Game/Maps/Rook/Rook": "Bind",
}
AGENT_ID_TO_NAME = {
    "add6443a-41bd-e414-f6ad-e58d267f4e95": "jett",
    "320b2a48-4d9b-a075-30f1-1f93a9b638fa": "sova",
    "dade69b4-4f5a-8528-247b-219e5a1facd6": "fade",
    "117ed9e3-49f3-6512-3ccf-0cada7e3823b": "cypher",
    "707eab51-4836-f488-046a-cda6bf494859": "viper",
    "a3bfb853-43b2-7238-a4f1-ad90e9e46bcc": "reyna",
    "1e58de9c-4950-5125-93e9-a0aee9f98746": "killjoy",
    "bb2a4828-46eb-8cd1-e765-15848195d751": "neon",
    "41fb69c1-4189-7b37-f117-bcaf1e96f1bf": "astra",
    "1dbf2edd-4729-0984-3115-daa5eed44993": "clove",
    "efba5359-4016-a1e5-7626-b1ae76895940": "vyse",
    "7f94d92c-4234-0a36-9646-3a87eb8b5c89": "yoru",
    "8e253930-4c05-31dd-1b6c-968525494517": "omen",
    "5f8d3a7f-467b-97f3-062c-13acf203c006": "breach",
    "6f2a04ca-43e0-be17-7f36-b3908627744d": "skye",
    "f94c3b30-42be-e959-889c-5aa313dba261": "raze",
    "9f0d8ba9-4140-b941-57d3-a7ad57c6b417": "brimstone",
    "22697a3d-45bf-8dd7-4fec-84a9e28c69d7": "chamber",
    "0e38b510-41a8-5780-5e8f-568b2a4f2d6c": "iso",
    "569fdd95-4d10-43ab-ca70-79becc718b46": "sage",
    "601dbbe7-43ce-be57-2a40-4abd24953621": "kayo",
    "cc8b64c8-4b25-4ff9-6e7f-37b4da43d235": "deadlock",
    "df1cb487-4902-002e-5c17-d28e83e78588": "waylay",
    "e370fa57-4757-3604-3648-499e1f642d3f": "gekko",
    "95b78ed7-4637-86d9-7e41-71ba8c293152": "harbor",
    "b444168c-4e35-8076-db47-ef9bf368f384": "tejo",
    "eb93336a-449b-9c1b-0a54-a891f7921d69": "phoenix",
    "92eeef5d-43b5-1d4a-8d03-b3927a09034b": "veto",
}


# ========== 工具函数 ==========


def load_api_data(filepath: str) -> Dict[str, Any]:
    """
    加载API数据，自动处理gzip压缩

    Args:
        filepath: JSON文件路径（可能是gzip压缩的）

    Returns:
        解析后的JSON数据
    """
    import subprocess

    # 尝试直接读取
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
            for line in content.split("\n"):
                line = line.strip()
                if line:
                    try:
                        data = json.loads(line)
                        print("  文件未压缩，直接读取成功")
                        return data
                    except json.JSONDecodeError:
                        continue
    except UnicodeDecodeError:
        pass

    # 检测gzip头位置
    with open(filepath, "rb") as f:
        raw_data = f.read()

    gzip_start = raw_data.find(b"\x1f\x8b")

    if gzip_start >= 0:
        print(f"  检测到gzip压缩数据（偏移{gzip_start}字节）")
        # 使用dd跳过头部 + gunzip解压
        cmd = f"dd if={filepath} bs=1 skip={gzip_start} 2>/dev/null | gunzip 2>&1"
        result = subprocess.run(cmd, shell=True, capture_output=True)

        # gunzip返回码可能是2（有警告但成功），只要有输出就算成功
        if len(result.stdout) > 0:
            print("  文件已解压")
            data_str = result.stdout.decode("utf-8")
        else:
            raise ValueError(
                f"Gzip解压失败: {result.stderr.decode('utf-8', errors='ignore')}"
            )
    else:
        # 不是gzip文件
        print("  未检测到压缩，尝试直接读取")
        data_str = raw_data.decode("utf-8")

    # 解析JSON（可能有多行）
    lines = [line.strip() for line in data_str.split("\n") if line.strip()]

    for line in lines:
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            continue

    raise ValueError("无法解析JSON数据")


def get_map_name(map_id: str) -> str:
    """获取地图名称"""
    return MAP_ID_TO_NAME.get(map_id, map_id)


def get_agent_name(character_id: str) -> str:
    """获取英雄名称"""
    return AGENT_ID_TO_NAME.get(character_id, "unknown")


def calculate_player_stats(player: Dict[str, Any], total_rounds: int) -> Dict[str, Any]:
    """
    计算玩家统计数据

    Args:
        player: 原始玩家数据
        total_rounds: 比赛总回合数（用于计算ACS和ADR）

    Returns:
        格式化的统计数据
    """
    # 计算ACS (Average Combat Score) - 使用比赛总回合数
    acs = round(int(player["statsScore"]) / total_rounds) if total_rounds > 0 else 0

    # 计算ADR (Average Damage per Round) - 使用比赛总回合数
    adr = round(player["totalDamage"] / total_rounds) if total_rounds > 0 else 0

    # 计算爆头率
    total_shots = (
        player["totalHeadshots"] + player["totalBodyshots"] + player["totalLegshots"]
    )
    hs_percent = (
        f"{round(player['totalHeadshots'] / total_shots * 100)}%"
        if total_shots > 0
        else "0%"
    )

    # 计算KD差
    k = player["statsKills"]
    d = player["statsDeaths"]
    diff = k - d

    # 简化的Rating估算（非官方公式）
    kd_ratio = k / max(d, 1)
    rating = round((kd_ratio * 0.5 + acs / 300 + adr / 150) / 3, 2)

    return {
        "rating": rating,
        "acs": acs,
        "k": k,
        "d": d,
        "a": player["statsAssists"],
        "diff": diff,
        "kast": "0%",  # 占位符
        "adr": adr,
        "hs_percent": hs_percent,
        "fk": player["firstKillCount"],
        "fd": 0,  # 占位符
        "fkfd_diff": player["firstKillCount"],
    }


def convert_api_to_match_format(api_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    将API数据转换为比赛格式

    Args:
        api_data: 原始API响应数据

    Returns:
        转换后的比赛数据
    """
    battle_detail = api_data["battle_detail"]
    player_game_view = battle_detail["playerGameView"]
    players = battle_detail["players"]

    # 获取基本信息
    map_name = get_map_name(player_game_view["mapId"])
    total_rounds = player_game_view["roundsPlayed"]  # 比赛总回合数
    player_team = player_game_view["playerTeamId"]

    # 分队
    team_a_players = []  # Blue队
    team_b_players = []  # Red队

    for player in players:
        player_data = {
            "name": player["name"].split("#")[0],  # 移除标签号
            "nationality": "cn",
            "agents": [get_agent_name(player["characterId"])],
            "stats": calculate_player_stats(player, total_rounds),  # 传入比赛总回合数
        }

        if player["teamId"] == "Blue":
            team_a_players.append(player_data)
        else:
            team_b_players.append(player_data)

    # 按Rating排序（从高到低）
    team_a_players.sort(key=lambda x: x["stats"]["rating"], reverse=True)
    team_b_players.sort(key=lambda x: x["stats"]["rating"], reverse=True)

    # 计算队伍分数
    if player_team == "Blue":
        team_a_score = player_game_view["roundsWon"]
        team_b_score = total_rounds - team_a_score
    else:
        team_b_score = player_game_view["roundsWon"]
        team_a_score = total_rounds - team_b_score

    # 生成round_history占位符
    round_history_a = ["none"] * total_rounds
    round_history_b = ["none"] * total_rounds

    # 构建最终格式
    result = {
        "map": map_name,
        "map_pick": "Unknown",
        "teams": [
            {
                "team_name": "Team A (Blue)",
                "score": team_a_score,
                "players": team_a_players,
                "round_history": round_history_a,
            },
            {
                "team_name": "Team B (Red)",
                "score": team_b_score,
                "players": team_b_players,
                "round_history": round_history_b,
            },
        ],
    }

    return result


# ========== 主函数 ==========


def process_single_file(
    input_file: str, output_file: str, show_details: bool = True
) -> bool:
    """
    处理单个文件

    Args:
        input_file: 输入文件路径
        output_file: 输出文件路径
        show_details: 是否显示详细信息

    Returns:
        是否成功
    """
    try:
        # 读取原始数据
        if show_details:
            print(f"\n正在读取文件: {input_file}")
        api_data = load_api_data(input_file)
        if show_details:
            print("✓ 文件读取成功")

        # 转换数据格式
        if show_details:
            print("正在转换数据格式...")
        match_data = convert_api_to_match_format(api_data)
        if show_details:
            print("✓ 数据转换成功")

        # 保存转换后的数据
        if show_details:
            print(f"正在保存到: {output_file}")
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(match_data, f, ensure_ascii=False, indent=2)
        if show_details:
            print("✓ 文件保存成功")

        # 显示结果
        if show_details:
            print(f"\n地图: {match_data['map']}")
            print(
                f"比分: {match_data['teams'][0]['score']} - {match_data['teams'][1]['score']}"
            )

            print("\n队伍 A (Blue):")
            for player in match_data["teams"][0]["players"]:
                print(
                    f"  {player['name']:<20} {player['agents'][0]:<10} "
                    f"K/D/A: {player['stats']['k']}/{player['stats']['d']}/{player['stats']['a']} "
                    f"Rating: {player['stats']['rating']}"
                )

            print("\n队伍 B (Red):")
            for player in match_data["teams"][1]["players"]:
                print(
                    f"  {player['name']:<20} {player['agents'][0]:<10} "
                    f"K/D/A: {player['stats']['k']}/{player['stats']['d']}/{player['stats']['a']} "
                    f"Rating: {player['stats']['rating']}"
                )

        return True

    except Exception as e:
        print(f"✗ 处理失败: {input_file}")
        print(f"  错误: {e}")
        return False


def main(input_path: str = None, output_path: str = None):
    """
    主函数 - 支持单文件和文件夹批量处理

    Args:
        input_path: 输入文件或文件夹路径
        output_path: 输出文件或文件夹路径
    """
    import os
    from pathlib import Path

    # 默认路径
    if input_path is None:
        input_path = "/mnt/user-data/uploads/1771149859965_38_.json"
    if output_path is None:
        output_path = "/mnt/user-data/outputs/converted_match_data.json"

    print("=" * 60)
    print("VALORANT 数据格式转换工具 v2.1")
    print("=" * 60)

    input_path = Path(input_path)
    output_path = Path(output_path)

    # 判断输入是文件还是文件夹
    if input_path.is_file():
        # 单文件处理
        print("\n模式: 单文件处理")

        # 如果输出路径是文件夹，生成文件名
        if output_path.is_dir():
            output_file = output_path / f"converted_{input_path.name}"
        else:
            output_file = output_path

        success = process_single_file(
            str(input_path), str(output_file), show_details=True
        )

        if success:
            print("\n" + "=" * 60)
            print("✓ 转换完成！")
            print("=" * 60)

    elif input_path.is_dir():
        # 文件夹批量处理
        print(f"\n模式: 批量处理文件夹")
        print(f"输入文件夹: {input_path}")
        print(f"输出文件夹: {output_path}")

        # 确保输出文件夹存在
        output_path.mkdir(parents=True, exist_ok=True)

        # 查找所有JSON文件
        json_files = list(input_path.glob("*.json"))

        if not json_files:
            print("\n✗ 未找到JSON文件")
            return

        print(f"\n找到 {len(json_files)} 个JSON文件")
        print("=" * 60)

        success_count = 0
        failed_count = 0

        for i, json_file in enumerate(json_files, 1):
            print(f"\n[{i}/{len(json_files)}] 处理: {json_file.name}")

            # 生成输出文件名
            output_file = output_path / f"converted_{json_file.name}"

            # 处理文件
            if process_single_file(
                str(json_file), str(output_file), show_details=False
            ):
                success_count += 1
                print(f"✓ 成功 -> {output_file.name}")
            else:
                failed_count += 1

        # 显示统计
        print("\n" + "=" * 60)
        print("批量转换完成！")
        print("=" * 60)
        print(f"总文件数: {len(json_files)}")
        print(f"成功: {success_count}")
        print(f"失败: {failed_count}")
        print(f"输出目录: {output_path}")

    else:
        print(f"\n✗ 路径不存在: {input_path}")
        return

    print("\n" + "=" * 60)
    print("注意事项:")
    print("  - nationality 已设为 'cn'")
    print("  - kast 设为占位值 '0%'")
    print("  - fd (首死) 设为占位值 0")
    print("  - round_history 设为占位值 ['none', ...]")
    print("  - rating 为估算值（非官方公式）")
    print("=" * 60)


if __name__ == "__main__":
    input_path = "./jsons_rbw"
    output_path = "./matches/outputs"
    main(input_path, output_path)
