#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
合并 markdown 文件脚本
根据 config.json 中的 chapters 顺序整合 content 目录下的所有 markdown 文件
"""

import json
import os
from pathlib import Path
from datetime import datetime

def merge_markdown_files():
    """根据配置文件中的 chapters 合并 markdown 文件"""
    
    config_path = 'config.json'
    content_dir = 'content'
    output_path = 'merged_output.md'
    
    # 检查 content 目录是否存在
    if not os.path.exists(content_dir):
        print(f"错误: 找不到 {content_dir} 目录")
        return
    
    # 读取配置文件
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
    except FileNotFoundError:
        print(f"错误: 找不到配置文件 {config_path}")
        return
    except json.JSONDecodeError as e:
        print(f"错误: 配置文件格式不正确 - {e}")
        return
    
    # 获取 chapters
    render_order = config.get('chapters', [])
    if not render_order:
        print("警告: chapters 为空")
        return
    
    site_info = config.get('siteInfo', {})
    
    # 创建输出文件
    print(f"开始合并 {len(render_order)} 个文件...\n")
    
    with open(output_path, 'w', encoding='utf-8') as output_file:
        # 写入网站信息
        output_file.write(f"# {site_info.get('title', 'Untitled')}\n\n")
        output_file.write(f"**{site_info.get('subtitle', '')}**\n\n")
        
        if site_info.get('other'):
            output_file.write(f"*{site_info['other']}*\n\n")
        
        output_file.write(f"作者: {site_info.get('author', 'Unknown')}\n\n")
        output_file.write(f"网站: {site_info.get('url', '')}\n\n")
        output_file.write(f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        output_file.write("=" * 80 + "\n\n")
        
        # 统计信息
        success_count = 0
        missing_count = 0
        error_count = 0
        
        # 按顺序合并文件
        for index, filename in enumerate(render_order, 1):
            file_path = os.path.join(content_dir, filename)
            
            print(f"[{index}/{len(render_order)}] 处理: {filename}")
            
            # 检查文件是否存在
            if not os.path.exists(file_path):
                print(f"    ⚠️  文件不存在，跳过")
                output_file.write(f"\n\n---\n\n")
                output_file.write(f"## ⚠️ {filename}\n\n")
                output_file.write(f"*此文件缺失*\n\n")
                missing_count += 1
                continue
            
            # 读取并写入文件内容
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read().strip()
                    
                    # 添加分隔符
                    output_file.write(f"\n\n---\n\n")
                    output_file.write(f"<!-- 第 {index} 篇 | 来源: {filename} -->\n\n")
                    
                    # 写入内容
                    output_file.write(content)
                    output_file.write("\n\n")
                    
                success_count += 1
                print(f"    ✅ 成功")
                
            except UnicodeDecodeError:
                print(f"    ❌ 编码错误，尝试其他编码")
                try:
                    with open(file_path, 'r', encoding='gbk') as f:
                        content = f.read().strip()
                        output_file.write(f"\n\n---\n\n")
                        output_file.write(f"<!-- 第 {index} 篇 | 来源: {filename} -->\n\n")
                        output_file.write(content)
                        output_file.write("\n\n")
                    success_count += 1
                    print(f"    ✅ 成功 (使用 GBK 编码)")
                except Exception as e:
                    print(f"    ❌ 读取失败: {e}")
                    error_count += 1
                    
            except Exception as e:
                print(f"    ❌ 读取失败: {e}")
                output_file.write(f"\n\n---\n\n")
                output_file.write(f"## ❌ {filename}\n\n")
                output_file.write(f"*读取失败: {e}*\n\n")
                error_count += 1
        
    
    # 输出统计信息
    print("\n" + "=" * 50)
    print(f"✨ 合并完成!")
    print(f"📊 统计信息:")
    print(f"   - 总计: {len(render_order)} 个文件")
    print(f"   - ✅ 成功: {success_count} 个")
    print(f"   - ⚠️  缺失: {missing_count} 个")
    print(f"   - ❌ 错误: {error_count} 个")
    print(f"📄 输出文件: {output_path}")
    print("=" * 50)

if __name__ == "__main__":
    merge_markdown_files()
