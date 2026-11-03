using System;
using RafiqPOS.Services;

public static class CoreMoneySqlProbe
{
    public static void Main(string[] args)
    {
        Console.Write(ReturnProfitSql.BuildTotals("r.id = @returnId",
            args.Length > 0 && args[0] == "catalog" ? ReturnProfitSql.ReturnedCatalogCostExpr : ReturnProfitSql.ReturnedCostExpr));
    }
}
