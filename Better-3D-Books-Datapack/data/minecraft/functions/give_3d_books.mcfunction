# Give player all 3D enchanted books
give @p minecraft:enchanted_book[custom_model_data=1,stored_enchantments=[{id:"minecraft:aqua_affinity",lvl:1}]]
give @p minecraft:enchanted_book[custom_model_data=96,stored_enchantments=[{id:"minecraft:sharpness",lvl:1}]]
give @p minecraft:enchanted_book[custom_model_data=80,stored_enchantments=[{id:"minecraft:protection",lvl:1}]]
give @p minecraft:enchanted_book[custom_model_data=25,stored_enchantments=[{id:"minecraft:efficiency",lvl:1}]]
give @p minecraft:enchanted_book[custom_model_data=41,stored_enchantments=[{id:"minecraft:fortune",lvl:1}]]

tellraw @p {"text":"Given all 3D enchanted books!","color":"green"}