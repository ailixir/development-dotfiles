object CommentStripper {

    fun strip(sql: String): String {
        val result = StringBuilder(sql.length)
        var i = 0

        while (i < sql.length) {
            when {
                sql[i] == '\'' -> {
                    result.append('\'')
                    i++
                    while (i < sql.length) {
                        result.append(sql[i])
                        if (sql[i] == '\'' && i + 1 < sql.length && sql[i + 1] == '\'') {
                            result.append(sql[i + 1])
                            i += 2
                        } else if (sql[i] == '\'') {
                            i++
                            break
                        } else {
                            i++
                        }
                    }
                }

                sql[i] == '"' -> {
                    result.append('"')
                    i++
                    while (i < sql.length && sql[i] != '"') {
                        result.append(sql[i])
                        i++
                    }
                    if (i < sql.length) {
                        result.append('"')
                        i++
                    }
                }

                sql[i] == '$' -> {
                    val remaining = sql.substring(i)
                    val tagMatch = Regex("^\\$([A-Za-z_]*)\\$").find(remaining)
                    if (tagMatch != null) {
                        val tag = tagMatch.value
                        result.append(tag)
                        i += tag.length
                        val endIdx = sql.indexOf(tag, i)
                        if (endIdx >= 0) {
                            result.append(sql, i, endIdx + tag.length)
                            i = endIdx + tag.length
                        } else {
                            result.append(sql.substring(i))
                            i = sql.length
                        }
                    } else {
                        result.append(sql[i])
                        i++
                    }
                }

                sql[i] == '/' && i + 1 < sql.length && sql[i + 1] == '*' -> {
                    i += 2
                    while (i + 1 < sql.length && !(sql[i] == '*' && sql[i + 1] == '/')) {
                        if (sql[i] == '\n') result.append('\n')
                        i++
                    }
                    if (i + 1 < sql.length) i += 2
                }

                sql[i] == '-' && i + 1 < sql.length && sql[i + 1] == '-' -> {
                    i += 2
                    while (i < sql.length && sql[i] != '\n') i++
                }

                else -> {
                    result.append(sql[i])
                    i++
                }
            }
        }
        return result.toString()
    }
}
