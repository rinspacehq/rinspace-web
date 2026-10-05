# 数学编辑器固定回归样本

本文是原创的自动化测试输入，不是用户文章或研究资料。公式只用于检验编辑、粘贴和代码块边界，不表达模型实现建议。

## 1. 第一段公式

$$A=\operatorname{softmax}\left(\frac{QK^{\mathsf{T}}}{\sqrt{d}}\right)V$$

### 1.1 行内公式与正文

行内变量 $q_i$ 与 $k_i$ 应留在正文中。

$$s_i=\sum_{j=1}^{i} k_j$$

## 2. 向量与索引

### 2.1 第二级小节

$$q_i,k_i\in\mathbb{R}^{d}$$

$$v_i\in\mathbb{R}^{m}$$

## 3. 矩阵与累计

### 3.1 第三级小节

$$S_i=\sum_{j=1}^{i} k_jv_j^{\mathsf{T}}$$

正文应与相邻的公式块分离。

## 4. 分式与括号

$$y_i=\frac{q_i^{\mathsf{T}}S_i}{q_i^{\mathsf{T}}s_i+\varepsilon}$$

$$z_i=\left(a_i+b_i\right)^2$$

## 5. Python 代码块与退出边界

下面的代码仅用于语法展示，不在检查中执行。

```python
# q, k: [length, dimension]; v: [length, value_dimension]
prefix_k = k.cumsum(axis=0)
prefix_v = v.cumsum(axis=0)
```

## 6. 从“累加”走向“遗忘与改写”

此处的小节名保留既有断言的边界标记，并非来自外部文稿的正文。

$$M_t=\lambda_t M_{t-1}+k_tv_t^{\mathsf{T}}$$

$$0\leq\lambda_t\leq1$$

## 7. 多行环境与续写

$$\begin{aligned}a&=b+c\\d&=e+f\end{aligned}$$

$$r_t=q_t^{\mathsf{T}}M_t$$

公式后的段落应保持可编辑，不进入 Python 代码块。

## 8. 近期相关架构（截至 2026-07）

本标题只作为既有检查的末尾小节标记；本测试没有时效性研究结论。

$$u_t=r_t+v_t$$

这是固定测试文稿的最后一段。
